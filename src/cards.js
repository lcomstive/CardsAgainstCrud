const jsonfile = require('jsonfile')
const globals = require('./globals.js')

const ConfigPath = './decks.json'

let attemptedDecks = 0
let drawnCalls = [], drawnResponses = []

LoadCallsResponses = (deck) =>
{
	for(let i = 0; i < deck.calls.length; i++)
		module.exports.Calls.push({
			deckID: deck.code,
			text: deck.calls[i].text.join('_'),
			responseCount: deck.calls[i].numResponses
		})
	for(let i = 0; i < deck.responses.length; i++)
		module.exports.Responses.push({
			deckID: deck.code,
			text: deck.responses[i].text
		})
}

LoadDeck = (deck) =>
{
	// Check if deck with code already exists
	for(let i = 0; i < module.exports.Decks.length; i++)
	{
		if(module.exports.Decks[i].code == deck.code)
		{
			console.log('Deck \'' + deck.name + '\ [' + deck.code + '] already added')
			return
		}
	}

	module.exports.Decks.push(deck)
	LoadCallsResponses(deck)

	console.log('Added deck \'' + deck.name + '\' [' + deck.code + '] (' + deck.calls.length + ' calls, ' + deck.responses.length + ' responses)')
	module.exports.Save()
}

DeckNames = () =>
{
	if(!module.exports.Decks || module.exports.Decks.length == 0)
		return 'None'
	return '\'' + module.exports.Decks.map((data) => data.name).join('\', \'') + '\''
}

module.exports =
{
	Calls: [],
	Responses: [],
	Decks: [],

	Finished: false,

	AddDeck: (id) =>
	{
		// Don't do anything if the deck ID is invalid
		if(id == null || id == '')
			return
		// Check for an already existing deck with the same ID
		for(let i = 0; i < module.exports.Decks.length; i++)
		{
			if(module.exports.Decks[i].code == id)
			{
				if(attemptedDecks <= 0)
					module.exports.Finished = true
				return
			}
		}
		module.exports.Finished = false
		attemptedDecks++
		try
		{
			globals.Cardcast.deck(id).then((deck) =>
			{
				deck.populatedPromise.then(() =>
				{
					LoadDeck({
						code: deck.code,
						name: deck.name,
						description: deck.description,
						author: deck.author,
						url: deck.baseURL,

						calls: deck.calls,
						responses: deck.responses
					})

					attemptedDecks--
					module.exports.Finished = attemptedDecks <= 0
					if(module.exports.Finished)
						attemptedDecks = 0
				}).catch((reason) =>
				{
					console.log('Couldn\'t add deck \'' + id + '\' - ' + reason)
					attemptedDecks--
					module.exports.Finished = attemptedDecks <= 0
					if(module.exports.Finished)
						attemptedDecks = 0
				})
			})
		}
		catch(e)
		{
			console.log('Couldn\'t add deck \'' + id + '\' - [exception] ' + e.message)
		}
	},

	DrawCard: () =>
	{
		if(module.exports.Responses.length == 0)
			return null
		let index = -1, picked = 0
		while(drawnResponses.includes(index = Math.round(Number(Math.random() * module.exports.Responses.length) - 1)))
		{
			picked++
			if(picked >= module.exports.Responses.length)
			{
				drawnCalls = []
				picked = 0
			}
		}
		drawnResponses.push(index)
		return module.exports.Responses[index]
	},

	DrawHand: () =>
	{
		let cards = []
		for(let i = 0; i < 7; i++)
			cards.push(module.exports.DrawCard())
		return cards
	},

	DrawCall: () =>
	{
		if(module.exports.Calls.length == 0)
			return null
		let index = -1, picked = 0
		while(drawnCalls.includes(index = Math.round(Number(Math.random() * module.exports.Calls.length) - 1)))
		{
			picked++
			if(picked >= module.exports.Calls.length)
			{
				drawnCalls = []
				picked = 0
			}
			break
		}
		drawnCalls.push(index)
		return module.exports.Calls[index]
	},

	Save: () =>
	{
		jsonfile.writeFile(ConfigPath, module.exports.Decks, (error) => { if(error) console.log('Failed to save \'' + ConfigPath + '\' - ' + error) })
		console.log('Saved decks [' + DeckNames() + ']')
	},

	Load: () =>
	{
		try
		{
			module.exports.Decks = jsonfile.readFileSync(ConfigPath)
			for(let i = 0; i < module.exports.Decks.length; i++)
				LoadCallsResponses(module.exports.Decks[i])
			console.log('Loaded decks [' + module.exports.Decks.length + ' decks, ' + module.exports.Calls.length + ' calls, ' + module.exports.Responses.length + ' responses]\n\t' + DeckNames())
		}
		catch (e)
		{
			console.log('Failed to load \'' + ConfigPath + '\' - ' + e.message)
		}
	}
}
