const FS = require("fs")
const HTTP = require("http")
const HTTPS = require("https")
const URL = require("url")
const ZLIB = require("zlib")

const Queue = require(`./Queue.js`)

// actual settings location
// const SETTINGS = require(`${__dirname}/settings.json`)

// todo dev settings location
const SETTINGS = require(`./ignore.json`)
const HTML_BUILDER = require(`./html_builder.json`)
const OAUTH_URL = `https://www.strava.com/oauth/authorize?response_type=code&client_id=${SETTINGS.client_id}&redirect_uri=http://localhost:${SETTINGS.port}/strava/oauth&scope=read,activity:read_all,activity:write&approval_prompt=force`
const CACHE = {
    user_oauth: {},
    geocode: {}
}
// SCHEMA: [ USER_ID, ACTIVITY_ID ]
const ACTIVITY_QUEUE = new Queue()


/**
 * Saves a JSON object in String form onto the file system.
 * 
 * @param {String} dir A path like directory where the file will be stored. (include trailing /)
 * @param {String} fileName The filename to write data to.
 * @param {String} data Data that will be stored in the file.
 * @param {Boolean} useCompression Will the resulting JSON file be compressed using gzip?
 */
function writeFileJson(dir = SETTINGS.data_dir, fileName = "_ERROR_", data = "STRING", useCompression = SETTINGS.gzip_comp_data) {
    dir = dir.trim()
    fileName = ("" + fileName).trim()

    FS.mkdirSync(dir, { recursive: true })

    if (typeof data != "string") {
        data = JSON.stringify(data)
    }

    // regular .json file
    if (!useCompression) {
        if (!fileName.endsWith(".json")) {
            fileName += ".json"
        }
        FS.writeFile(dir + "/" + fileName, data, "utf-8", () => { })
        return
    }

    // sanitizes file extension
    if (fileName.endsWith(".json")) {
        fileName += ".gz"
    } else if (!fileName.endsWith(".json.gz")) {
        fileName += ".json.gz"
    }


    // .json.gz file
    const gzip = ZLIB.createGzip({ level: 9 })
    gzip.pipe(FS.createWriteStream(dir + "/" + fileName))
    gzip.end(data)
}


/**
 * Reads a JSON file from the file system into a JSON object.
 * 
 * @param {String} location path like location including directory and filename with extension
 * @param {Boolean} isGzip is the data stored in compressed form?
 * @returns data JSON | error String
 */
function readJsonFile(location, isGzip = SETTINGS.gzip_comp_data) {
    return new Promise((res, err) => {
        if (!location) {
            return err("[readJsonFile] missing file location")
        }

        if (!FS.existsSync(location)) {
            return err(`[readJsonFile] file @ "${location}" does not exist`)
        }

        // decompresses .json.gz file
        if (isGzip) {
            const UNZIP = ZLIB.createUnzip()
            const STREAM = FS.createReadStream(location).pipe(UNZIP)
            let result = ""
            STREAM.on("data", data => {
                result += data.toString()
            })
            STREAM.on("end", () => {
                UNZIP.end()
                res(JSON.parse(result))
            })
            return
        }

        // regular .json file
        FS.readFile(location, (error, buffer) => {
            if (error) {
                console.error(`${new Date()}`)
                console.error(error)
                return res(`[readJsonFile] error reading file @ "${error.path}" | ${error.message}`)
            }
            return res(JSON.parse(buffer.toString()))
        })
    })
}


/**
 * Returns the JSON object from initial authentication. Contains refresh token & access token.
 * 
 * {@link https://developers.strava.com/docs/getting-started API DOCS}
 * @param {String | Number} userid The userid of the Strava user
 * @param {Boolean} isGzip Is the data stored in compressed form?
 * @returns data JSON | error String
 */
function getUserOauth(userid, isGzip = SETTINGS.gzip_comp_data) {
    return new Promise((res, err) => {
        if (!userid) {
            return err("missing userid")
        }

        if (CACHE.user_oauth[userid]) {
            if (CACHE.user_oauth[userid].expires_at - (60 * 60) < (Math.floor(new Date().getTime() / 1000.0) + (60 * 60))) {
                updateTokens(userid, CACHE.user_oauth[userid].refresh_token)
                    .then(data => {
                        CACHE.user_oauth[userid] = data
                        res(data)
                    })
                    .catch(err)
            } else {
                res(CACHE.user_oauth[userid])
            }
            return
        }

        readJsonFile(SETTINGS.data_dir + "/strava_oauth/" + userid + (isGzip ? ".json.gz" : ".json"), isGzip)
            .then(data => {
                if (data.expires_at < (Math.floor(new Date().getTime() / 1000.0) + (60 * 60) + (60 * 60))) {
                    updateTokens(userid, data.refresh_token)
                        .then(data => {
                            CACHE.user_oauth[userid] = data
                            res(data)
                        })
                        .catch(err)
                    return
                } else {
                    CACHE.user_oauth[userid] = data
                    return res(data)
                }
            })
            .catch(error => {
                console.error(`${new Date()} [getUserOauth] ${error}`)
                return err(`[getUserOauth] error: ${error}`)
            })
    })
}


/**
 * Zero pads a number based on total number of decimal places.
 * @param {Number} number the number that will be zero padded
 * @param {Number} places how many places to zero pad on the left
 * @returns A string of the newly left zero padded number.
 */
function zeroPad(number, places = 2) {
    const stringNum = (number + "")
    if (stringNum.length < places) {
        return "0".repeat(places - stringNum.length) + stringNum
    }
    return number
}


/**
 * Formats seconds in to a human readable time string.
 * @param {Number} seconds the number of seconds that needs to be converted
 * @returns A string in MM:SS or hh:MM:SS format
 */
function format_secToString(seconds) {
    const minsInDecimal = seconds / 60
    const hh = Math.floor(minsInDecimal / 60)
    const MM = Math.floor(minsInDecimal)
    const SS = Math.round((minsInDecimal - MM) * 60)
    if (hh != 0) {
        return `${hh}:${zeroPad(MM % 60)}:${zeroPad(SS % 60)}`
    }
    return `${MM}:${zeroPad(SS)}`
}


/**
 * Turns metres per second in to km pace.
 * @param {Number} mps metres per second
 * @returns formatted string
 * @see format_secToString()
 */
function format_mpsToPaceKm(mps) {
    return format_secToString(1000 / mps)
}


/**
 * Turns metres per second in to mile pace.
 * @param {Number} mps metres per second
 * @returns formatted string
 * @see format_secToString()
 */
function format_mpsToPaceMi(mps) {
    return format_secToString(1609.34 / mps)
}


/**
 * Reverse geocode's the coordinate by checking the cache, file system, and finally fetches it.
 * @param {Number} pLat The coordinate's latitude.
 * @param {Number} pLon The coordinate's longitude.
 * @returns The api response from https://api.bigdatacloud.net/data/reverse-geocode
 */
function getGeocode(pLat, pLon) {
    return new Promise((res, err) => {
        // sanitizes coordinate to 3 decimal places
        const lon = (Math.floor(pLon * 1000) / 1000)
        const lat = (Math.floor(pLat * 1000) / 1000)
        const cacheFile = `${SETTINGS.data_dir}/geocode/${Math.floor(lat)}_${Math.floor(lon)}/${lat}_${lon}.json${SETTINGS.gzip_comp_data ? ".gz" : ""}`

        if (CACHE.geocode[cacheFile]) {
            // from the cache
            return res(CACHE.geocode[cacheFile])
        } else if (FS.existsSync(cacheFile)) {
            // from the file system
            readJsonFile(cacheFile)
                .then(data => {
                    CACHE.geocode[cacheFile] = data
                    res(data)
                })
                .catch(e => {
                    console.error(`[getGeocode] failed to read cache file`)
                    console.error(e)
                })
        } else {
            // fetches the data from API
            const REQUEST = HTTPS.request({
                host: "api.bigdatacloud.net",
                path: `/data/reverse-geocode?longitude=${lon}&latitude=${lat}&localityLanguage=en&key=${SETTINGS.api.bigdatacloud}`
            }, response => {
                let str = ""
                response.on("data", chunk => str += chunk)
                response.on("end", () => {
                    try {
                        const DATA = JSON.parse(str)
                        const split = cacheFile.split("/")
                        const file = split.pop()

                        writeFileJson(split.join("/"), file, JSON.stringify(DATA))
                        CACHE.geocode[cacheFile] = DATA
                        return res(DATA)
                    } catch (error) {
                        console.error(`${new Date()}`)
                        console.error(error)
                        return err(`[getGeocode] [fetch] failed to parse response from "https://api.bigdatacloud.net/data/reverse-geocode?longitude=${lon}&latitude=${lat}&localityLanguage=en&key=${SETTINGS.API.bigdatacloud} into JSON`)
                    }
                })
            })

            REQUEST.on("error", (error) => {
                console.error(`${new Date()}`)
                console.error(error)
                return err(`${new Date()} [getJson] error in https request`)
            })

            REQUEST.end()
        }
    })
}


/**
 * Updates the refresh token & access_token in the 'strava_oauth' folder.
 * 
 * @param {String} userid The user id.
 * @param {String} refreshToken The refresh token of the athlete.
 * @returns data JSON | error String
 */
function updateTokens(userid, refreshToken) {
    return new Promise((res, err) => {
        console.log(`/api/v3/oauth/token?client_id=${SETTINGS.client_id}&client_secret=${SETTINGS.client_secret}&grant_type=refresh_token&refresh_token=${refreshToken}`)
        const REQUEST = HTTPS.request({
            host: "www.strava.com",
            path: `/api/v3/oauth/token?client_id=${SETTINGS.client_id}&client_secret=${SETTINGS.client_secret}&grant_type=refresh_token&refresh_token=${refreshToken}`,
            method: "POST"
        }, response => {
            console.log(`/api/v3/oauth/token?client_id=${SETTINGS.client_id}&client_secret=${SETTINGS.client_secret}&grant_type=refresh_token&refresh_token=${refreshToken}`)
            let str = ""
            response.on("data", chunk => str += chunk)
            response.on("end", () => {
                try {
                    const DATA = JSON.parse(str)
                    if (DATA.errors) {
                        // error with getting refresh token
                        console.debug(DATA)
                        return
                    }
                    writeFileJson(SETTINGS.data_dir + "/strava_oauth/", userid, str)
                    res(DATA)
                } catch (error) {
                    console.error(`${new Date()}`)
                    console.error(error)
                    err(error)
                }
            })
        })
        REQUEST.on("error", error => {
            console.error(`${new Date()} [updateTokens] error:`)
            console.error(error)
        })
        REQUEST.end()
    })
}


/**
 * Returns JSON object after GET requesting the info from the Strava API.
 * 
 * {@link https://developers.strava.com/docs/reference API DOCS}
 * @param {String} endpoint Strava API endpoint url, not including /api/v3/
 * @param {String | Number} userid The userid who's access token will be used.
 * @returns data JSON | error String
 */
function getStravaAPI(endpoint, userid = null) {
    return new Promise((res, err) => {
        if (!endpoint) {
            return err("missing strava endpoint")
        }

        if (userid == null) {
            return err("missing user id")
        }

        // todo real endpoint uses HTTPS
        // const REQUEST = HTTPS.request({
        const REQUEST = HTTP.request({
            // host: "www.strava.com",
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
                    return res(DATA)
                } catch (error) {
                    console.error(`${new Date()}`)
                    console.error(error)
                    return err(`[getJson] failed to parse response from "https://www.strava.com/api/v3/${endpoint}" into JSON`)
                }
            })
        })

        REQUEST.setHeader("accept", "application/json")
        REQUEST.on("error", (error) => {
            console.error(`${new Date()}`)
            console.error(error)
            return err(`${new Date()} [getJson] error in https request`)
        })

        getUserOauth(userid)
            .then(user => {
                REQUEST.setHeader("authorization", `Bearer ${user.access_token}`)
                REQUEST.end()
            })
            .catch(error => {
                console.error(`${new Date()} [getStravaAPI] ${error}`)
                err(`[getStravaAPI] ${error}`)
            })
    })
}


/**
 * Does processing of the activities in the queue one at a time.
 * @param {String} activityid the activity id
 */
function processActivities(userid, activityid) {
    getStravaAPI("activities/" + activityid + "?include_all_efforts=0", userid)
        .then(data => {
            // todo finish
            writeFileJson(`${SETTINGS.data_dir}/user/${userid}/activities/`, activityid, JSON.stringify(data))

            // todo splits, weather, update, save updated
            let finalDescription = data.description + "\n[SPLITS]\n"
            for (const index in data.laps) {
                const LAP = data.laps[index]
                finalDescription += `[${zeroPad(index)}] ${LAP.distance}m\t> ${format_secToString(LAP.elapsed_time)}\t@ ${format_mpsToPaceKm(LAP.average_speed)}/km\t${format_mpsToPaceMi(LAP.average_speed)}/mi\n`
            }
            console.log(finalDescription)
            /*
            [SPLITS]
            distance    time    pace
            metres      MM:ss   "/km  "/mi
            
            */

            if (data.start_latlng && data.end_latlng) {
                // has gps
                const sLat = data.start_latlng[0]
                const sLon = data.start_latlng[1]
                const eLat = data.end_latlng[0]
                const eLon = data.end_latlng[1]

                console.log(data.start_latlng, data.end_latlng)
            }
        })
        .catch(e => {
            console.error(`${new Date()} [processActivities] failed to get activity/${activityid}`)
            console.error(e)
        })
        .finally(() => {
            const next = ACTIVITY_QUEUE.next()
            if (next && next.length == 2) {
                setTimeout(() => { processActivities(next[0], next[1]) }, 1000)
            }
        })
}


/**
 * Goes to Strava and refreshes for new activities
 */
function getNewActivities() {
    FS.readdir(SETTINGS.data_dir + "/strava_oauth/", (err, files) => {
        if (err) {
            console.error(`${new Date()}`)
            console.error(err)
            return
        }

        if (files.length == 0) {
            console.log(`${new Date()} [updateGetActivities] No users to refresh data from.`)
            return
        }

        const users = {}
        files.forEach(file => {
            users["" + file.split(".")[0]] = 1
        })

        const pollUser = userid => {
            getStravaAPI("athlete/activities", userid)
                .then(res => {
                    if (res.length == 0) {
                        return
                    }

                    const BASE_FS = SETTINGS.data_dir + "/user/" + userid + "/activities/"
                    FS.mkdirSync(BASE_FS, { recursive: true })

                    for (let i = 0; i < res.length; i++) {
                        if (FS.existsSync(BASE_FS + res[i].id + ".json")) {
                            continue
                        }
                        ACTIVITY_QUEUE.add([userid, "" + res[i].id])
                    }

                    const tmp = ACTIVITY_QUEUE.next()
                    if (tmp != null) {
                        processActivities(tmp[0], tmp[1])
                    }
                })
                .catch(e => {
                    console.error(`${new Date()}`)
                    console.error(e)
                })
        }

        for (const user in users) {
            pollUser(user)
        }
    })
}


/**
 * Handles building the webpage for responding to /strava/oauth?
 * 
 * @param {HTTP.IncomingMessage} req HTTP request
 * @param {HTTP.ServerResponse} res HTTP response
 * @param {String} msg Message to display on webpage as information.
 */
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


/**
 * Handles the routing for /strava/oauth?
 * @param {HTTP.IncomingMessage} req HTTP request
 * @param {HTTP.ServerResponse} res HTTP response
 */
function route_oauthHandler(req, res) {
    const QUERY = URL.parse(req.url, true).query
    if (QUERY.error == "access_denied") {
        // user clicked cancel on OAUTH prompt, try again
        route_oauthPrompt(req, res, "Cancel was pressed. Not authorized.")
        return
    }
    if (QUERY.scope == undefined || QUERY.code == undefined) {
        // how does this happen, try again
        route_oauthPrompt(req, res, "Epic error on Strava's end. Please try again.")
        return
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
    REQUEST.on("error", error => {
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
    console.log(`\n\n\n\n\n${new Date()}\n\tWeb server listening on\n\t\thttp://localhost:${SETTINGS.port}\n\tClick following link to authorize:\n\t\t${OAUTH_URL}`)
})

getNewActivities()