const HTTP = require("http")
const HTTPS = require("https")
const URL = require("url")

// actual settings location
// const SETTINGS = require(`${__dirname}/settings.json`)

// todo dev settings location
const SETTINGS = require(`./ignore.json`)

const SERVER = HTTP.createServer((req, res) => {
    if (req.url == "/favicon.ico" || req.method != "GET") {
        res.writeHead(403)
        res.end("403")
        return
    }
    if (req.url.startsWith("/strava/oauth?")) {
        console.log(`${new Date()} [GET REQ] ${req.url}`)
        const QUERY = URL.parse(req.url, true).query
        /*
        todo: confirm auth of scopes
            QUERY MUST
                NOT BE ERROR
                have
                    read
                    activity:write
                    activity:read_all
            token exchange @ POST https://www.strava.com/oauth/token
        */
        res.end(JSON.stringify(QUERY))
        return
    }
    res.writeHead(500)
    res.end("500")
})


function getJson(endpoint) {
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
            var str = ""
            response.on("data", chunk => str += chunk)
            response.on("end", () => {
                try {
                    const DATA = JSON.stringify(str)
                    res(DATA)
                } catch (error) {
                    err(`[getJson] failed to parse response from "https://www.strava.com/api/v3/${endpoint}" into JSON`)
                    console.error(`${new Date()}`)
                    console.error(error)
                }
            })
        })

        REQUEST.setHeader("accept", "application/json")
        REQUEST.setHeader("authorization", `Bearer ${SETTINGS.token}`)

        REQUEST.on("error", (error) => {
            err(`${new Date()} [getJson] error in https request`)
            console.error(`${new Date()}`)
            console.error(error)
        })

        REQUEST.end()
    })
}



SERVER.listen(SETTINGS.port, () => {
    const OAUTH_URL = `https://www.strava.com/oauth/authorize?response_type=code&client_id=${SETTINGS.client_id}&redirect_uri=http://localhost:${SETTINGS.port}&scope=read,activity:read_all,activity:write&approval_prompt=auto`
    console.log(`\n\n\n\n\n${new Date()}\nwebserver listening on\n\thttp://localhost:${SETTINGS.port}\nClick following link to authorize:\n\t${OAUTH_URL}`)
})


// todo case test
getJson().then(data => {
    console.log("ok")
}).catch(e => {
    console.error(e)
})