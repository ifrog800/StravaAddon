const FS = require("fs")
const HTTP = require("http")
const HTTPS = require("https")
const URL = require("url")
const ZLIB = require("zlib")

// actual settings location
// const SETTINGS = require(`${__dirname}/settings.json`)

// todo dev settings location
const SETTINGS = require(`./ignore.json`)
const HTML_BUILDER = require(`./html_builder.json`)
const OAUTH_URL = `https://www.strava.com/oauth/authorize?response_type=code&client_id=${SETTINGS.client_id}&redirect_uri=http://localhost:${SETTINGS.port}/strava/oauth&scope=read,activity:read_all,activity:write&approval_prompt=force`





function writeFileJson(dir = SETTINGS.data_dir, fileName = "_ERROR_", data = "STRING", useCompression = true) {
    dir = dir.trim()
    fileName = fileName.trim()

    FS.mkdirSync(dir, { recursive: true })

    if (typeof data != "string") {
        data = JSON.stringify(data)
    }

    if (!useCompression) {
        if (!fileName.endsWith(".json")) {
            fileName += ".json"
        }
        FS.writeFile(dir + fileName, data, "utf-8", () => { })
        return
    }

    if (fileName.endsWith(".json")) {
        fileName += ".gz"
    } else if (!fileName.endsWith(".json.gz")) {
        fileName += ".json.gz"
    }


    const gzip = ZLIB.createGzip({ level: 9 })
    const file = FS.createWriteStream(fileName)
    gzip.end(data)
    gzip.pipe(file)
    file.close()
}



function getStravaAPI(endpoint) {
    return new Promise((res, err) => {
        // todo real endpoint uses HTTPS
        // const REQUEST = HTTPS.request({
        const REQUEST = HTTP.request({
            // host: "https://www.strava.com",
            // path: "/api/v3/" + endpoint

            // todo dev test server
            host: "localhost",
            port: 4848,
            path: "/pretend/path/to/api/endpoint"
        }, response => {
            let str = ""
            response.on("data", chunk => str += chunk)
            response.on("end", () => {
                try {
                    const DATA = JSON.parse(str)
                    res(DATA)
                } catch (error) {
                    err(`[getJson] failed to parse response from "https://www.strava.com/api/v3/${endpoint}" into JSON`)
                    console.error(`${new Date()}`)
                    console.error(error)
                }
            })
        })

        REQUEST.setHeader("accept", "application/json")
        REQUEST.setHeader("authorization", `Bearer ${SETTINGS.token}`) // todo use actual user bearer token

        REQUEST.on("error", (error) => {
            err(`${new Date()} [getJson] error in https request`)
            console.error(`${new Date()}`)
            console.error(error)
        })

        REQUEST.end()
    })
}


function route_oauthPrompt(req, res, msg = "Click here to grant access to your Strava account.") {
    res.writeHead(200)
    res.write(HTML_BUILDER.html_start)
    res.write("Grant OAUTH")
    res.write(HTML_BUILDER.head_title)
    res.write(HTML_BUILDER.head_end)
    res.write(`<a href="${OAUTH_URL}"><h1>${msg}</h1>${HTML_BUILDER.svg_btn_strava_connectwith_orange}</a>`)
    res.write(HTML_BUILDER.html_end)
    res.end()
}


function route_oauthHandler(req, res) {
    const QUERY = URL.parse(req.url, true).query
    if (QUERY.error == "access_denied") {
        // user clicked cancel on OAUTH prompt, try again
        route_oauthPrompt(req, res, "Cancel was pressed. Not authorized.")
    }
    if (QUERY.scope == undefined || QUERY.code == undefined) {
        // how does this happen, try again
        route_oauthPrompt(req, res, "Epic error on Strava's end. Please try again.")
    }

    const REQUIRED_SCOPES = ["read", "activity:write", "activity:read_all"]
    const PROVIDED_SCOPES = QUERY.scope.split(",") || []
    let allScopes = true
    for (i = 0; i < PROVIDED_SCOPES.length; i++) {
        allScopes = allScopes && REQUIRED_SCOPES.includes(PROVIDED_SCOPES[i].toLocaleLowerCase())
    }
    if (!allScopes) {
        // missing at least 1 scope, try again
        route_oauthPrompt(req, res, "Not all permissions were given. Please make sure all the requested permissions are selected.")
        return
    }

    // yay all scopes are given, get token time
    const REQUEST = HTTPS.request({
        host: "www.strava.com",
        path: `/api/v3/oauth/token?client_id=${SETTINGS.client_id}&client_secret=${SETTINGS.client_secret}&grant_type=authorization_code&code=${QUERY.code}`,
        method: "POST"
    }, response => {
        let str = ""
        response.on("data", chunk => str += chunk)
        response.on("end", () => {
            try {
                const DATA = JSON.parse(str)
                if (DATA.errors) {
                    // error with getting token, try again
                    route_oauthPrompt(req, res, "An unexpected error has occurred. Please try again.")
                    console.debug(DATA)
                    return
                }

                res.writeHead(200)
                res.write(HTML_BUILDER.html_start)
                res.write("OAUTH Granted")
                res.write(HTML_BUILDER.head_title)
                res.write(HTML_BUILDER.head_end)
                res.write(`<h1>Very Cool.</h1>`)
                res.write(HTML_BUILDER.html_end)
                res.end()

                writeFileJson(SETTINGS.data_dir + "/strava_oauth/", DATA.athlete.id, JSON.stringify(DATA))
            } catch (error) {
                console.error(`${new Date()}`)
                console.error(error)
            }
        })
    })
    REQUEST.on("error", (error) => {
        console.error(`${new Date()}`)
        console.error(error)
    })
    REQUEST.end()
}


const SERVER = HTTP.createServer((req, res) => {
    console.log(`${new Date()} ${req.url}`)
    if (req.url == "/favicon.ico" || req.method != "GET") {
        res.writeHead(403)
        res.end("403")
        return
    }
    if (req.url == "/") {
        route_oauthPrompt(req, res)
        return
    }
    if (req.url.startsWith("/strava/oauth?")) {
        route_oauthHandler(req, res)
        return
    }
    res.writeHead(500)
    res.end("500")
})


SERVER.listen(SETTINGS.port, () => {
    console.log(`\n\n\n\n\n${new Date()}\nwebserver listening on\n\thttp://localhost:${SETTINGS.port}\nClick following link to authorize:\n\t${OAUTH_URL}`)
})
