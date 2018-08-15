require('dotenv').config() // process the .env file
const express = require('express')
const path = require('path')
const CaCApp = require('./src/index.app.js')

const app = express()

app.get('/', (req, res) =>
{
	res.sendFile(path.resolve('client/index.html'))
})
app.get('/:file(*)', (req, res) =>
{
	res.sendFile(path.resolve('client/' + req.params.file))
})

CaCApp.Start(app)
