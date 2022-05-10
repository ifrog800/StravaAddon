const http = require("http")
const PORT = 4747

const SERVER = http.createServer((req, res) => {
    res.end("ok")
})

SERVER.listen(PORT, () => {
    console.log(`listening on http://localhost:${PORT}`)
})