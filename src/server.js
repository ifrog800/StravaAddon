const FS = require("fs")
const HTTP = require("http")
const HTTPS = require("https")
const URL = require("url")
const ZLIB = require("zlib")

const Logger = require("./Logger")
const Queue = require(`./Queue.js`)

// actual settings location
const SETTINGS = require(`${__dirname}/settings.json`)

const HTML_BUILDER = require(`${__dirname}/html_builder.json`)
const OAUTH_URL = `https://www.strava.com/oauth/authorize?response_type=code&client_id=${SETTINGS.client_id}&redirect_uri=http://localhost:${SETTINGS.port}/strava/oauth&scope=read,activity:read_all,activity:write&approval_prompt=force`
// creates a program memory cache to speed up file system acsess, WARNING it currently never gets cleared
const CACHE = {
    user_oauth: {},
    geocode: {},
    weather: {},
    d: new Date()
}
// SCHEMA: [ USER_ID, ACTIVITY_ID ]
const ACTIVITY_QUEUE = new Queue()

// the program logger that logs to file and terminal
const l = new Logger(SETTINGS.data_dir + `/logs/`)
l.i("initializing...")

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
        FS.writeFile(`${dir}/${fileName}`, data, "utf-8", () => { })
        l.i(`updated file: ${dir}/${fileName}`, `[writeFileJson]`, true)
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
    l.i(`updated file: ${dir}/${fileName}`, `[writeFileJson]`, true)
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

        l.i(`read file @ ${location}`, `[readJsonFile]`, true)

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
                l.e(error, `[readJsonFile] read file error @ "${error.path}" | ${error.message}`)
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
            l.i(`[getUserOauth] in cache ${userid}`)
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

        l.i(`[getUserOauth] reading ${userid} from file...`)
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
                l.e(error, `[getUserOauth]`)
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
 * Turns a degree relative to North into a formated string to nearest 45 degree angle.
 * ↖↑↗
 * ←↻→
 * ↙↓↘
 * @param {Number} deg expecting 0-360 degrees but out or range also work
 * @returns A formated string w/ arrow, degree and label
 */
function format_degreeToNESF(deg) {
    if (typeof deg != "number") {
        return ""
    }
    if (deg < 0) {
        deg = 360 - ((-1 * deg) % 360)
    }
    if (360 < deg) {
        deg = deg % 360
    }
    switch (Math.round(deg / 360 * 8)) {
        case 0:
        case 8:
            return `↑ ${deg}°N`
        case 1:
            return `↗ ${deg}°NE`
        case 2:
            return `→ ${deg}°E`
        case 3:
            return `↘ ${deg}°SE`
        case 4:
            return `↓ ${deg}°S`
        case 5:
            return `↙ ${deg}°SW`
        case 6:
            return `← ${deg}°W`
        case 7:
            return `↖ ${deg}°NW`
        default:
            return `↻↻↻ °Error`
    }
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
 * Gets the historical weather data of a location on one day.
 * @param {String} location zipcode | locality, state | coordinate
 * @param {String} date fomated in yyyy-MM-dd to retrive one day's worth of data
 * @param {String} type zipcode | locality | coord
 * @returns JSON data | string error
 */
function getVisualCrossing(location, date, type) {
    return new Promise((res, err) => {
        const httpPath = `/VisualCrossingWebServices/rest/services/timeline/${location}/${date}/${date}`
        const query = `?unitGroup=us&key=${SETTINGS.api.visualcrossing}&contentType=json`
        const cacheFile = `${SETTINGS.data_dir}/weather/${type}/${location}/${date}.json${SETTINGS.gzip_comp_data ? ".gz" : ""}`

        if (CACHE.weather[cacheFile]) {
            // from the cache
            return res(CACHE.weather[cacheFile])
        } else if (FS.existsSync(cacheFile)) {
            // from the file system
            readJsonFile(cacheFile)
                .then(data => {
                    CACHE.weather[cacheFile] = data
                    res(data)
                })
                .catch(e => {
                    l.e(e, `[getVisualCrossing] failed to read cache file`)
                })
        } else {
            // fetches the data from API
            const REQUEST = HTTPS.request({
                host: "weather.visualcrossing.com",
                path: httpPath + query
            }, response => {
                let str = ""
                response.on("data", chunk => str += chunk)
                response.on("end", () => {
                    try {
                        const DATA = JSON.parse(str)
                        const split = cacheFile.split("/")
                        const file = split.pop()

                        writeFileJson(split.join("/"), file, JSON.stringify(DATA))
                        CACHE.weather[cacheFile] = DATA
                        return res(DATA)
                    } catch (error) {
                        l.e(error, `[getVisualCrossing] [fetch] failed to parse response from "https://weather.visualcrossing.com${httpPath + query}" into JSON [${str}]`)
                        return err(`[getVisualCrossing] [fetch] failed to parse response from "https://weather.visualcrossing.com${httpPath + query}" into JSON ${error}`)
                    }
                })
            })

            REQUEST.on("error", (error) => {
                l.e(error, `[getVisualCrossing] error in https request`)
                return err(`[getVisualCrossing] error in https request ${error}`)
            })

            REQUEST.end()
        }
    })
}


/**
 * Reverse geocode's the coordinate by checking the cache, file system, and finally fetches it.
 * @param {Number} pLat The coordinate's latitude.
 * @param {Number} pLon The coordinate's longitude.
 * @returns The api response from https://api.bigdatacloud.net/data/reverse-geocode
 */
function getGeocode(pLat, pLon) {
    return new Promise((res, err) => {
        // sanitizes coordinate to 2 decimal places
        const lon = (Math.floor(pLon * 100) / 100)
        const lat = (Math.floor(pLat * 100) / 100)
        const cacheFile = `${SETTINGS.data_dir}/geocode/${Math.floor(lat)}_${Math.floor(lon)}/${lat}_${lon}.json${SETTINGS.gzip_comp_data ? ".gz" : ""}`

        if (CACHE.geocode[cacheFile]) {
            // from the cache
            l.i(`[getGeocode] reading cache for ${lat}, ${lon}`)
            return res(CACHE.geocode[cacheFile])
        } else if (FS.existsSync(cacheFile)) {
            // from the file system
            l.i(`[getGeocode] reading ${cacheFile}`)
            readJsonFile(cacheFile)
                .then(data => {
                    CACHE.geocode[cacheFile] = data
                    return res(data)
                })
                .catch(e => {
                    l.e(e, `[getGeocode] failed to read cached file`)
                    return err(`[getGeocode] failed to read cached file ${e}`)
                })
        } else {
            // fetches the data from API
            l.i(`[getGeocode] requesting https://api.bigdatacloud.net/data/reverse-geocode?longitude=${lon}&latitude=${lat}&localityLanguage=en&key=${SETTINGS.api.bigdatacloud}`)
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
                        l.e(error, `[getGeocode] [fetch] failed to parse response from "https://api.bigdatacloud.net/data/reverse-geocode?longitude=${lon}&latitude=${lat}&localityLanguage=en&key=${SETTINGS.API.bigdatacloud}" into JSON`)
                        return err(`[getGeocode] [fetch] failed to parse response from "https://api.bigdatacloud.net/data/reverse-geocode?longitude=${lon}&latitude=${lat}&localityLanguage=en&key=${SETTINGS.API.bigdatacloud}" into JSON, ${error}`)
                    }
                })
            })

            REQUEST.on("error", (error) => {
                l.e(error, `[getGeocode] error in https request`)
                return err(`[getGeocode] error in https request ${error}`)
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
        l.i(`/api/v3/oauth/token?client_id=${SETTINGS.client_id}&client_secret=${SETTINGS.client_secret}&grant_type=refresh_token&refresh_token=${refreshToken}`, `[updateTokens]`)
        const REQUEST = HTTPS.request({
            host: "www.strava.com",
            path: `/api/v3/oauth/token?client_id=${SETTINGS.client_id}&client_secret=${SETTINGS.client_secret}&grant_type=refresh_token&refresh_token=${refreshToken}`,
            method: "POST"
        }, response => {
            l.i(`/api/v3/oauth/token?client_id=${SETTINGS.client_id}&client_secret=${SETTINGS.client_secret}&grant_type=refresh_token&refresh_token=${refreshToken}`, `[updateTokens]`)
            let str = ""
            response.on("data", chunk => str += chunk)
            response.on("end", () => {
                try {
                    const DATA = JSON.parse(str)
                    if (DATA.errors) {
                        // error with getting refresh token
                        l.fatal(DATA, `[updateTokens] failed geting refresh tokens`)
                        return
                    }
                    writeFileJson(SETTINGS.data_dir + "/strava_oauth/", userid, str)
                    res(DATA)
                } catch (error) {
                    l.e(error, `[updateTokens] failed parsing result into JSON`)
                    err(`[updateTokens] failed parsing result into JSON ${error}`)
                }
            })
        })
        REQUEST.on("error", error => {
            l.e(error, `[updateTokens] http POST error`)
            res(`[updateTokens] http POST error`)
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

        l.i(`[getStravaAPI] requesting: https://www.strava.com/api/v3/${endpoint} as ${userid}`)
        const REQUEST = HTTPS.request({
            host: "www.strava.com",
            path: "/api/v3/" + endpoint
        }, response => {
            let str = ""
            response.on("data", chunk => str += chunk)
            response.on("end", () => {
                try {
                    const DATA = JSON.parse(str)
                    return res(DATA)
                } catch (error) {
                    l.e(`[getStravaAPI] failed to parse response from "https://www.strava.com/api/v3/${endpoint}" into JSON`)
                    return err(`[getStravaAPI] failed to parse response from "https://www.strava.com/api/v3/${endpoint}" into JSON ${error}`)
                }
            })
        })

        REQUEST.setHeader("accept", "application/json")
        REQUEST.on("error", (error) => {
            l.e(`[getStravaAPI] error in https request`)
            return err(`[getStravaAPI] error in https request ${error}`)
        })

        getUserOauth(userid)
            .then(user => {
                REQUEST.setHeader("authorization", `Bearer ${user.access_token}`)
                REQUEST.end()
            })
            .catch(error => {
                l.e(error, `[getStravaAPI] failed to get user ${userid} oauth`)
                err(`[getStravaAPI] ${error}`)
            })
    })
}


function putStravaActivity(userid, activityid, newData) {
    return new Promise((res, err) => {
        l.i(`[putStravaActivity] updating ${userid}'s activity: ${activityid} with ${JSON.stringify(newData)}`)
        const REQUEST = HTTPS.request({
            host: "www.strava.com",
            path: `/api/v3/activities/${activityid}`,
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            }
        }, response => {
            let str = ""
            response.on("data", chunk => str += chunk)
            response.on("end", () => {
                try {
                    const DATA = JSON.parse(str)
                    if (DATA.errors) {
                        l.d(DATA, `[putStravaActivity] error updating activity data`)
                        l.dump(newData, `[putStravaActivity].newData`)
                        return err(`[putStravaActivity] error updating activity data`)
                    }

                    writeFileJson(`${SETTINGS.data_dir}/user/${userid}/activities/`, activityid, JSON.stringify(DATA))
                    res("updated activity " + activityid)
                } catch (error) {
                    l.e(`[getStravaAPI] failed to parse response from PUT "https://www.strava.com/api/v3/activities/${activityid}" into JSON`)
                    return err(`[getStravaAPI] failed to parse response from PUT "https://www.strava.com/api/v3/activities/${activityid}" into JSON ${error}`)
                }
            })
        })
        REQUEST.on("error", error => {
            l.e(error, `[putStravaActivity] https error`)
            err(`[putStravaActivity] https error ${error}`)
        })

        getUserOauth(userid)
            .then(user => {
                REQUEST.setHeader("authorization", `Bearer ${user.access_token}`)
                REQUEST.write(JSON.stringify(newData))
                REQUEST.end()
            })
            .catch(error => {
                l.e(`[putStravaActivity] [getUserOauth] ${error}`)
                err(`[putStravaActivity] [getUserOauth] ${error}`)
            })
    })
}


/**
 * Does processing of the activities in the queue one at a time.
 * @param {String} activityid the activity id
 */
function processActivities(userid, activityid) {
    /*
    <original description>
    [SPLITS]
    distance    elapsed moving  pace
    metres      MM:ss   MM:ss   "/km  "/mi
    [WEATHER]
    xx.x°F <condition>, feels like xx.x°F, Humidity xx.xx%, Wind xx.xmph from ↻ xx°NE w/ xx.xmph gusts, Clouds Cover xx.x%, UV Index x
    */
    let finalDescription
    let activity

    l.i(`[processActivities] new activity ${activityid} by ${userid}`)
    getStravaAPI("activities/" + activityid + "?include_all_efforts=0", userid)
        .then(dataActivity => {
            activity = dataActivity
            writeFileJson(`${SETTINGS.data_dir}/user/${userid}/activities/`, activityid, JSON.stringify(dataActivity))

            if (activity.description.includes(SETTINGS.description_ending)) {
                return Promise.reject("already processed activity")
            }

            finalDescription = dataActivity.description + "\n[SPLITS]\n"
            for (const index in dataActivity.laps) {
                const LAP = dataActivity.laps[index]
                finalDescription += `[${zeroPad(index)}] ${LAP.distance}m\t> ${format_secToString(LAP.elapsed_time)}, ${format_secToString(LAP.moving_time)}\t@ ${format_mpsToPaceKm(LAP.average_speed)}/km\t${format_mpsToPaceMi(LAP.average_speed)}/mi\n`
            }


            if (dataActivity.start_latlng && dataActivity.end_latlng) {
                // has gps so process gps data into weather data
                activityDate = dataActivity.start_date.split("T")[0]
                activityName = dataActivity.name
                const sLat = dataActivity.start_latlng[0]
                const sLon = dataActivity.start_latlng[1]
                const eLat = dataActivity.end_latlng[0]
                const eLon = dataActivity.end_latlng[1]

                return getGeocode(sLat, sLon)
            } else {
                return Promise.resolve({ "strava_addon_skip": true })
            }
        })
        .then(dataGeocode => {
            if (dataGeocode["strava_addon_skip"]) {
                return Promise.resolve({ "strava_addon_skip": true })
            }

            let location, type;
            if (dataGeocode["countryCode"] != "US") {
                // use coordinate
                location = `${dataGeocode.latitude}%2C${dataGeocode.longitude}`
                type = "coords"
            } else if (dataGeocode["postcode"]) {
                // find weather by zip code
                location = `${dataGeocode.postcode}`
                type = "postcode"
            } else {
                // some places in USA dont have zip code try to use (locality, principalSubdivision)
                location = `${dataGeocode.locality.replace(/ +/gi, "%20")}%2C${dataGeocode.principalSubdivision.replace(/ +/gi, "%20")}`
                type = "locality"
            }

            // calls weather api using optimized location for optimal cache hitting
            return getVisualCrossing(location, activity.start_date.split("T")[0], type)
        })
        .then(dataWeather => {
            if (dataWeather["strava_addon_skip"]) {
                return putStravaActivity(userid, activityid, {
                    "commute": activity.commute,
                    "trainer": activity.trainer,
                    "hide_from_home": activity.hide_from_home,
                    "description": finalDescription,
                    "name": activity.name,
                    "type": activity.type,
                    "gear_id": activity.gear_id
                })
            }

            // process weather data at start of activity
            const date = new Date(activity.start_date)
            const roundedHour = date.getHours() + (date.getMinutes() >= 30 ? 1 : 0)
            const w = dataWeather.days[0].hours[roundedHour]

            finalDescription += "\n[WEATHER]\n"
            finalDescription += `${w.temp}°F ${w.conditions}, feels like ${w.feelslike}°F, Humidity ${w.humidity}%, `
            finalDescription += `Wind ${w.windspeed}mph from ${format_degreeToNESF(w.winddir)} w/ ${w.windgust}mph gusts, `
            finalDescription += `Clouds Cover ${w.cloudcover}%, UV Index ${w.uvindex}`
            if (w.precip) {
                finalDescription += `${w.precip}" rain\n`
            } else if (w.snow) {
                finalDescription += `${w.snow}" new snow, ${w.snowdepth}" total snow\n`
            } else {
                finalDescription += "\n"
            }

            return putStravaActivity(userid, activityid, {
                "commute": activity.commute,
                "trainer": activity.trainer,
                "hide_from_home": activity.hide_from_home,
                "description": finalDescription + SETTINGS.description_ending,
                "name": SETTINGS.weather_icons[w.icon] + " " + activity.name,
                "type": activity.type,
                "gear_id": activity.gear_id
            })
        })
        .then(data => {
            // done with update
            l.i(`[processActivities] done updating activity ${activityid} by ${userid}`)
        })
        .catch(e => {
            l.e(e, `[processActivities] something broke while processig activity ${activityid} by ${userid}: `)
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
    FS.mkdirSync(SETTINGS.data_dir + "/strava_oauth/", { recursive: true })
    FS.readdir(SETTINGS.data_dir + "/strava_oauth/", (err, files) => {
        if (err) {
            l.e(err, `[getNewActivities] readdir error`)
            return
        }

        if (files.length == 0) {
            l.i(`[updateGetActivities] No users to refresh data from.`)
            return
        }

        const users = {}
        files.forEach(file => {
            users["" + file.split(".")[0]] = 1
        })

        const pollUser = userid => {
            l.i(`[getNewActivities] [pollUser] finding new activities from ${userid}`)
            getStravaAPI("athlete/activities", userid)
                .then(res => {
                    if (res.length == 0) {
                        return
                    }

                    const BASE_FS = SETTINGS.data_dir + "/user/" + userid + "/activities/"
                    FS.mkdirSync(BASE_FS, { recursive: true })

                    for (let i = 0; i < res.length; i++) {
                        const FILE = BASE_FS + res[i].id + ".json" + (SETTINGS.gzip_comp_data ? ".gz" : "")
                        if (FS.existsSync(FILE)) {
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
                    l.e(e)
                })
        }

        for (const user in users) {
            l.i(`[getNewActivities] found user ${user}`)
            pollUser(user)
        }
        l.i("[getNewActivities] done scanning for users...")
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
        l.i(`[route_oauthHandler] responded w/ access_denied ${req.url}`, "", true)
        route_oauthPrompt(req, res, "Cancel was pressed. Not authorized.")
        return
    }
    if (QUERY.scope == undefined || QUERY.code == undefined) {
        // how does this happen, try again
        l.i(`[route_oauthHandler] responded w/ missing query ${req.url}`, "", true)
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
        l.i(`[route_oauthHandler] responded w/ 1+ scopes ${req.url}`, "", true)
        route_oauthPrompt(req, res, "Not all permissions were given. Please make sure all the requested permissions are selected.")
        return
    }

    // yay all scopes are given, get token time
    l.i(`[route_oauthHandler] [request] getting users's token`)
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
                    l.d(DATA, "[route_oauthHandler] [request] unexpected error")
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

                l.i(`[route_oauthHandler] [request] updated ${DATA.athlete.id}'s token`)
                writeFileJson(SETTINGS.data_dir + "/strava_oauth/", DATA.athlete.id, JSON.stringify(DATA))
                getNewActivities()
            } catch (error) {
                l.e(error, `[route_oauthHandler] failed to parse JSON data`)
            }
        })
    })
    REQUEST.on("error", error => {
        l.e(error, `[route_oauthHandler] https POST token error`)
    })
    REQUEST.end()
}


const SERVER = HTTP.createServer((req, res) => {
    l.i(`[server] new connection @ ${req.url}`)
    if (req.url == "/favicon.ico" || req.method != "GET") {
        res.writeHead(403)
        res.end("403")
        l.i(`[server] responded w/ 403 favicon`, "", true)
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
    l.i(`[server] responded w/ 500 ${req.url}`, "", true)
    res.writeHead(500)
    res.end("500")
})


SERVER.listen(SETTINGS.port, () => {
    console.log(`\n\n\n\n\n${new Date()}\n\tWeb server listening on\n\t\thttp://localhost:${SETTINGS.port}\n\tClick following link to authorize:\n\t\t${OAUTH_URL}`)
})

getNewActivities()