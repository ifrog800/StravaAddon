const { Console } = require("console")
const fs = require("fs")
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


module.exports = class Logger {
    constructor(logDir = "./logs/", logFile = null, currentDate = new Date().getDate()) {
        fs.mkdirSync(logDir, { recursive: true })
        if (!logFile) {
            const d = new Date()
            logFile = `${d.getFullYear()}-${zeroPad(d.getMonth() + 1)}-${d.getDate()}.log`
            currentDate = d.getDate()
        }
        this.logDir = logDir
        this.fileStream = fs.createWriteStream(this.logDir + "/" + logFile, { flags: "a" })
        this.fileConsole = new Console(this.fileStream)
        this.currentDate = currentDate
    }

    updateFile() {
        const d = new Date()
        if (d.getDate() != this.currentDate) {
            fs.mkdirSync(this.logDir, { recursive: true })
            const logFile = `${d.getFullYear()}-${zeroPad(d.getMonth() + 1)}-${d.getDate()}.log`
            this.fileStream.close()
            this.fileStream = fs.createWriteStream(this.logDir + "/" + logFile, { flags: "a" })
            this.fileConsole = new Console(this.fileStream)
            this.currentDate = d.getDate()
        }
    }

    write(data, lvl = "unkwn", msg = "", bypassTty = true) {
        this.updateFile()
        const d = `${new Date()} [${lvl}] ${msg ? (msg + " ") : ""}`
        if (typeof data == "string") {
            const msg = d + data
            if (!bypassTty) {
                console.log(msg)
            }
            this.fileConsole.log(msg)
        } else {
            if (!bypassTty) {
                console.log(d)
                console.log(data)
            }
            this.fileConsole.log(d)
            if (data != "") {
                this.fileConsole.log(msg)
            }
        }
    }

    dump(data, msg = "", bypassTty = true) {
        const d = `${new Date()} [dumpx] ${msg}`
        if (!bypassTty) {
            console.log(d)
            console.log(data)
        }
        this.fileConsole.log(d)
        this.fileConsole.log(data)
    }

    info(data, msg = "", bypassTty = false) {
        this.write(data, "infoo", msg, bypassTty)
    }

    error(data, msg = "", bypassTty = false) {
        this.write(data, "error", msg, bypassTty)
    }

    warn(data, msg = "", bypassTty = false) {
        this.write(data, "warnn", msg, bypassTty)
    }

    fatal(data, msg = "", bypassTty = false) {
        this.write(data, "fatal", msg, bypassTty)
    }

    debug(data, msg = "", bypassTty = false) {
        this.write(data, "debug", msg, bypassTty)
    }

    i(data, msg = "", bypassTty = false) {
        this.write(data, "infoo", msg, bypassTty)
    }

    e(data, msg = "", bypassTty = false) {
        this.write(data, "error", msg, bypassTty)
    }

    w(data, msg = "", bypassTty = false) {
        this.write(data, "warnn", msg, bypassTty)
    }

    f(data, msg = "", bypassTty = false) {
        this.write(data, "fatal", msg, bypassTty)
    }

    d(data, msg = "", bypassTty = false) {
        this.write(data, "debug", msg, bypassTty)
    }
}