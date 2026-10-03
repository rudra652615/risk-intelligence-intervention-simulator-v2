const fs = require("fs");
const path = require("path");

function loadProjectEnv(fileName = ".env") {
    const envPath = path.join(__dirname, "..", "..", fileName);

    if (!fs.existsSync(envPath)) {
        return;
    }

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

    lines.forEach((line) => {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            return;
        }

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex === -1) {
            return;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = stripQuotes(trimmed.slice(separatorIndex + 1).trim());

        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

function stripQuotes(value) {
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }

    return value;
}

module.exports = {
    loadProjectEnv
};
