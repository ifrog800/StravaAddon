const HTTP = require("http")
const HTTPS = require("https")

// actual settings location
// const SETTINGS = require(`${__dirname}/settings.json`)

// todo dev var location
const SETTINGS = require(`./ignore.json`)

const SERVER = HTTP.createServer((req, res) => {
    res.end("ok")
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
    console.log(`\n\n\n\n\nlistening on http://localhost:${SETTINGS.port}`)
})


// todo case test
getJson().then(data => {
    console.log("ok")
}).catch(e => {
    console.error(e)
})