require('dotenv').config() // process the .env file
const http = require('http')
const jsonfile = require('jsonfile')
const WebSocketServer = require('websocket').server
const CardcastAPI = require('./cardcast-api/index.js').CardcastAPI

let Cards = require('./cards.js')
let globals = require('./globals.js')

let port = process.env.PORT || 8080
let httpServer = undefined

Cards.Load()
process.title = "CardsAgainstCrud Server"

globals.Cardcast = new CardcastAPI({ timeout: 15000 });
if(process.env.DECKS)
{
	let decks = process.env.DECKS.includes(';') ? process.env.DECKS.split(';') : [ process.env.DECKS ]
	for(let i = 0; i < decks.length; i++)
	{
		Cards.AddDeck(decks[i])
		console.log('Adding \'' + decks[i] + '\'')
	}
}
else
{
	console.log('Decks required! Add \'DECKS=CODE\' or \'DECKS=CODE;CODE;CODE\' to your environment or a .env file')
	return
}

setCzar = (connection) =>
{
	globals.TotalResponses = 0
	globals.Responses = []
	globals.GameInProgress = false

	if(!connection)
	{
		globals.Czar = undefined
		console.log('Set czar as empty')
		return
	}
	console.log('Set ' + globals.Clients.get(connection).username + ' as czar')
	globals.Czar = connection

	if(!globals.Call)
		globals.Call = Cards.DrawCall()

	console.log('Call: ' + (globals.Call ? globals.Call.text : '(null)'))

	let connections = [...globals.Clients.keys()]
	for(let i = 0; i < connections.length; i++)
		sendCall(connections[i])
}

sendCall = (receiver) =>
{
	let czar = receiver == globals.Czar
	receiver.send('call=' + JSON.stringify({
		card: globals.Call.text,
		isCzar: czar
	}))
}

setup = (expressApp) =>
{
	if(httpServer)
	{
		console.log('Already setup')
		return
	}
	let port = process.env.PORT || 8080
	httpServer = http.createServer(expressApp)
	httpServer.listen(port, () => { console.log('Listening on port ' + port) })

	globals.WebSocketServer = new WebSocketServer({
		httpServer: httpServer
	})

	let clients = []
	globals.WebSocketServer.on('request', (request) =>
	{
		let connection = request.accept(null, request.origin)
		globals.Clients.set(connection,
		{
			address: connection.remoteAddress,
			username: '',
			cards: [],
			responses: [],
			points: 0
		})

		connection.on('message', (msg) =>
		{
			if(!msg.type === 'utf8')
				return
			let data = msg.utf8Data
			let connections = [...globals.Clients.keys()]
			if(data.startsWith('username='))
			{
				let username = data.substring('username='.length)

				for(let i = 0; i < connections.length; i++)
				{
					if(globals.Clients.get(connections[i]).username.toLowerCase() == username.toLowerCase())
					{
						username = ''
						break
					}
				}
				if(!username)
				{
					connection.send('invalidUsername')
					return
				}

				globals.Clients.get(connection).username = username
				console.log('\'' + username + '\' Connected')

				// They're "verified", give them cards
				let cards = Cards.DrawHand()
				globals.Clients.get(connection).cards = cards

				for(let i = 0; i < connections.length; i++)
					connections[i].send('info=' + JSON.stringify({
						playerCount: connections.length,
						points: globals.Clients.get(connections[i]).points
					}))

				if(!globals.Czar || globals.Clients.size == 0)
					setCzar(connection)
				else
				{
					sendCall(connection)
					if(!globals.GameInProgress)
					{
						console.log('Sending cards to \'' + globals.Clients.get(connection).username + '\'... [1]')
						connection.send('cards=' + JSON.stringify(cards))
					}
					else
						connection.send('responses=' + JSON.stringify(globals.Responses))
				}
			}
			else if(data.startsWith('responses='))
			{
				let responses = globals.Clients.get(connection).responses = JSON.parse(data.substring('responses='.length))
				globals.Responses.push({
					username: globals.Clients.get(connection).username,
					responses: responses
				})

				let newCards = globals.Clients.get(connection).cards
				responses.forEach((response) =>
				{
					for(let i = newCards.length - 1; i >= 0; i--)
						if(response == newCards[i].text)
							newCards.splice(i, 1)
				})
				for(let i = newCards.length; i < 7; i++)
					newCards.push(Cards.DrawCard())
				console.log('Sending cards to \'' + globals.Clients.get(connection).username + '\'... [2]')
				connection.send('cards=' + JSON.stringify((globals.Clients.get(connection).cards = newCards)))

				if(globals.Responses.length == globals.Clients.size - 1)
				{
					globals.GameInProgress = true

					let connections = [...globals.Clients.keys()]
					for(let i = 0; i < connections.length; i++)
						connections[i].send('responses=' + JSON.stringify(globals.Responses))
				}
			}
			else if(data.startsWith('czarChoose='))
			{
				let winnerIndex = parseInt(data.substring('czarChoose='.length))
				let userWon = globals.Responses[winnerIndex].username
				for(let i = 0; i < connections.length; i++)
				{
					if(userWon && globals.Clients.get(connections[i]).username == userWon)
					{
						connections[i].send('info=' + JSON.stringify({
							playerCount: connections.length,
							points: ++globals.Clients.get(connections[i]).points
						}))
						console.log('\'' + userWon + '\' won with \'' + globals.Clients.get(connections[i]).responses.join('\', \'') + '\'')
						userWon = ''
						setTimeout(() =>
						{
							globals.Call = Cards.DrawCall()
							globals.Responses = []
							globals.GameInProgress = false

							setCzar(connections[i])

							for(let j = 0; j < connections.length; j++)
							{
								if(i != j)
									connections[j].send('cards=' + JSON.stringify(globals.Clients.get(connections[j]).cards))
							}
						}, 3000)
					}
					connections[i].send('czarChose=' + winnerIndex)
				}
				if(userWon) // An error, like the winner disconnected before their card was selected
					setTimeout(() =>
					{
						globals.Call = Cards.DrawCall()
						globals.Responses = []
						globals.GameInProgress = false

						let czarIndex = Math.max(Math.round(Number(Math.random() * connections.length) - 1), 0)
						console.log('New czar: ' + czarIndex)
						setCzar(connections[czarIndex])

						for(let j = 0; j < connections.length; j++)
								connections[j].send('cards=' + JSON.stringify(globals.Clients.get(connections[j]).cards))
					}, 3000)
			}
			else
				console.log('Got message of type \'' + msg.type + '\'')
		})

		connection.on('close', (reasonCode, description) =>
		{
			if(!globals.Clients.has(connection))
				return
			let username = globals.Clients.get(connection).username
			if(username)
				console.log('\'' + username + '\' disconnected')
			globals.Clients.delete(connection)
			if(!username)
				return

			connections = [...globals.Clients.keys()]
			for(let i = 0; i < connections.length; i++)
				connections[i].send('info=' + JSON.stringify({
					playerCount: connections.length,
					points: globals.Clients.get(connections[i]).points
				}))

			if(globals.Czar == connection)
			{
				if(connections.length == 0)
				{
					globals.Responses = []
					globals.Call = undefined
					globals.GameInProgress = false
					setCzar(undefined)
				}
				else
				{
					// Set random player as czar
					let index = Math.max(Math.round(Number(Math.random() * connections.length) - 1), 0)
					console.log('Index: ' + (index + 1) + '/' + connections.length)
					setCzar(connections[index])
				}
			}

		})
	})
	process.on('SIGHUP', () => Cards.Save())
}

module.exports.Start = (expressApp) => setup(expressApp)
