
const fs = require('fs')

const args = process.argv

const rawdata = fs.readFileSync(args[2])
const bigjson = JSON.parse(rawdata)
const { abi } = bigjson

process.stdout.write(JSON.stringify(abi))
