let websocket
let serverAddress = ''
let pageLogin = undefined
let pageGame = undefined
let statusText = undefined
let clientInfo =
{
	username: '(null)',
	nsfwAllowed: false,
	isCzar: false,
	cards: []
}
let connection = undefined
let gameState = "none" // none | cardSent | czar
let callCard =
{
	responses: [],
	requiredResponses: 1,
	text: 'Something _ something.'
}
let roundDelay = 3

let events =
{
	open: (event) =>
	{
		statusText.innerHTML = 'Status: connected'

		pageLogin.root.classList.remove('enabled')
		pageGame.root.classList.remove('disabled')

		pageLogin.root.classList.add('disabled')
		pageGame.root.classList.add('enabled')

		connection.send('username=' + clientInfo.username)
	},
	close: (event) =>
	{
		statusText.innerHTML = 'Status: '
		switch(event.code)
		{
			case 1006:
				statusText.innerHTML += 'failed to connect'
				break
			default:
				statusText.innerHTML += 'disconnected'
				break
		}
		if(event.code != 1000)
			console.log('WebSocket closed (' + event.code + ')')

		connection = undefined
		setCards([])
		logout()
	},
	message: (event) =>
	{
		let cardSend = document.getElementById('gameSendCard')
		if(event.data.startsWith('cards='))
		{
			setCards(clientInfo.cards = JSON.parse(event.data.substring('cards='.length)))
			setupDragAndDrop()
		}
		else if(event.data.startsWith('responses='))
		{
			let responses = JSON.parse(event.data.substring('responses='.length))

			callCard.responses = []
			for(let i = 0; i < responses.length; i++)
				callCard.responses.push({
					username: responses[i].username,
					responses: responses[i].responses,
					text: responses[i].responses.join(', ')
				})
			console.log('Received ' + callCard.responses.length + ' ' + (callCard.responses.length == 1 ? 'response' : 'responses'))

			if(responses.length > 0 && (!clientInfo.cards || clientInfo.cards.length == 0) && !clientInfo.isCzar)
				gameState = 'cardSent'

			setCards(callCard.responses)

			if(clientInfo.isCzar)
				cardSend.children[0].innerHTML = 'Drop a card here to select it'
			else
				cardSend.children[0].innerHTML = 'Wait for the next round'
		}
		else if(event.data.startsWith('info='))
		{
			let gameInfo = JSON.parse(event.data.substring('info='.length))
			document.getElementById('gameInfoPlayerCount').innerHTML = 'Players: ' + gameInfo.playerCount
			document.getElementById('gameInfoPlayerPoints').innerHTML = 'Points: ' + gameInfo.points
		}
		else if(event.data.startsWith('call='))
		{
			let call = JSON.parse(event.data.substring('call='.length))
			setCall(call.card)
			setCzar(call.isCzar)
		}
		else if(event.data.startsWith('czarChose='))
		{
			let winnerIndex = event.data.substring('czarChose='.length)
			pageGame.callCard.children[0].innerHTML = callCard.text
			pageGame.callCard.children[0].innerHTML = pageGame.lastPlayedCard.children[0].innerHTML = replaceUnderscores(callCard.responses[winnerIndex].responses)
			pageGame.lastPlayedCardUsername.innerHTML = callCard.responses[winnerIndex].username

			console.log('Setting background for \'' + pageGame.gameCards[winnerIndex].children[0].innerHTML + '\'')
			pageGame.gameCards[winnerIndex].style.backgroundColor = '#eee'

			let count = roundDelay
			cardSend.children[0].innerHTML = 'Wait for the next round (' + count + '...)'
			let interval = setInterval(() =>
			{
				cardSend.children[0].innerHTML = 'Wait for the next round (' + --count + '...)'
				if(count <= 1)
					clearInterval(interval)
			}, 1000)
		}
		else if(event.data == 'invalidUsername')
			logout('Invalid or taken username')
	},
	error: (error) =>
	{
		console.log('Websocket error: ' + error)
	}
}

connect = (address) =>
{
	if(window.WebSocket === undefined)
	{
		alert('Your browser doesn\'t support websockets')
		return
	}
	if(connection)
		return
	try { connection = new WebSocket((window.location.href.indexOf('https://') == 0 ? 'wss://' : 'ws://') + address) }
	catch(e)
	{
		console.log('Invalid URL: \'' + address + '\'')
		logout('Invalid URL')
		return
	}
	connection.onopen = events.open
	connection.onclose = events.close
	connection.onmessage = events.message
	connection.onerror = events.error
}

disconnect = () =>
{
	if(!connection)
		return
	connection.close()
	connection = undefined
}

replaceUnderscores = (responses) =>
{
	let index = -1, responseIndex = 0
	let text = callCard.text
	while((index = text.indexOf('_')) != -1 && responseIndex < responses.length)
		text = text.substring(0, index) + '<i>' + responses[responseIndex++] + '</i>'+ text.substring(index + 1)
	return text
}

setCzar = (isCzar) =>
{
	clientInfo.isCzar = isCzar
	console.log('Changed to ' + (isCzar ? 'czar' : 'player'))

	if(isCzar)
	{
		setCards([])
		document.getElementById('gameSendCard').children[0].innerHTML = 'You are the card czar'
	}
	else
		setCards(clientInfo.cards)
	gameState = isCzar ? 'czar' : 'none'
}

setCards = (cards) =>
{
	for(let i = 0; i < pageGame.gameCards.length; i++)
	{
		let element = pageGame.gameCards[i]
		if(!element || element.children.length == 0)
		{
			console.log('Couldn\'t find \'gameCard' + (i + 1) + '\'')
			break
		}
		element.style.backgroundColor = 'white'
		if(i > cards.length - 1)
			element.children[0].innerHTML = ''
		else
			element.children[0].innerHTML = cards[i].text
	}

	setupDragAndDrop()
}

setCall = (call) =>
{
	console.log('New call: ' + call)

	let cardSend = document.getElementById('gameSendCard')

	callCard =
	{
		responses: [],
		requiredResponses: (call.split('_').length - 1),
		text: call
	}

	for(let i = 0; i < pageGame.gameCards.length; i++)
		pageGame.callCard.children[0].innerHTML = call
	cardSend.children[0].innerHTML = 'Drop card to send' + (callCard.requiredResponses != 1 ? ' (0 / ' + callCard.requiredResponses + ')' : '')
}

login = () =>
{
	let hrefAddress = window.location.href.replace(/http(|s):\/\/|\//g, '')
	serverAddress = pageLogin.inputs.serverAddress.value || hrefAddress
	clientInfo.username = pageLogin.inputs.username.value;

	if(clientInfo.username == '')
	{
		pageLogin.errorText.innerHTML = 'Please provide a username'
		return
	}
	else if(clientInfo.username.length < 3 || clientInfo.username.length > 20)
	{
		pageLogin.errorText.innerHTML = 'Please provide a valid username'
		return
	}

	localStorage.setItem('serverAddress', serverAddress == hrefAddress ? '' : serverAddress)
	localStorage.setItem('username', clientInfo.username)

	pageLogin.main.classList.remove('enabled')
	pageLogin.loading.classList.add('enabled')

	gameState = 'none'
	setCards([])
	connect(serverAddress)
}

logout = (errorText = '') =>
{
	if(connection)
		disconnect()
	pageLogin.root.classList.remove('disabled')
	pageGame.root.classList.remove('enabled')

	pageLogin.root.classList.add('enabled')
	pageGame.root.classList.add('disabled')

	pageLogin.main.classList.add('enabled')
	pageLogin.loading.classList.remove('enabled')

	pageGame.lastPlayedCard.children[0].innerHTML = ''
	pageGame.lastPlayedCardUsername.innerHTML = ''

	setCards([])

	pageLogin.errorText.innerHTML = errorText
}

setupDragAndDrop = () =>
{
	let cardSend = document.getElementById('gameSendCard')
	for(let i = 0; i < pageGame.gameCards.length; i++)
	{
		let card = pageGame.gameCards[i]
		if(!card || !card.children[0].innerHTML)
			continue
		let dragStart = (event) =>
		{
			card.style.opacity = '0.3'
			card.style.transform = 'scale(0.75)'

			event.dataTransfer.effectAllowed = 'move'
			event.dataTransfer.setData('text/plain', i.toString())
		}
		let dragEnd = (event) =>
		{
			card.style.opacity = '1'
			card.style.transform = 'scale(1)'
		}

		card.addEventListener('dragstart', dragStart, false)
		card.addEventListener('dragend', dragEnd)
	}
	cardSend.addEventListener('dragover', (event) =>
	{
		if(event.preventDefault && ((!clientInfo.isCzar && gameState == 'none') || clientInfo.isCzar))
			event.preventDefault()
	})
	cardSend.addEventListener('drop', (event) =>
	{
		if(gameState == 'cardSent')
		{
			cardSend.children[0].innerHTML = 'Wait for the next round'
			return true
		}
		let droppedIndex = event.dataTransfer.getData('text/plain')
		let dropped = pageGame.gameCards[droppedIndex]

		if(event.stopPropogation)
			event.stopPropogation()
		if(!dropped || !dropped.children[0].innerHTML)
			return

		if(!clientInfo.isCzar)
		{
			callCard.responses.push(dropped.children[0].innerHTML)

			dropped.children[0].innerHTML = ''
			cardSend.children[0].innerHTML = 'Drop card to send' + (callCard.requiredResponses != 1 ? ' (' + callCard.responses.length + ' / ' + callCard.requiredResponses + ')' : '')
			pageGame.callCard.children[0].innerHTML = replaceUnderscores(callCard.responses)

			if(callCard.requiredResponses > 1)
				console.log('responses: ' + callCard.responses.length + '/' + callCard.requiredResponses)
			if(callCard.responses.length >= callCard.requiredResponses)
			{
				gameState = 'cardSent'
				cardSend.children[0].innerHTML = 'Sent'
				connection.send('responses=' + JSON.stringify(callCard.responses))
			}
		}
		else
		{
			connection.send('czarChoose=' + droppedIndex)
			gameState = 'cardSent'
		}

		return false
	})
}

setup = () =>
{
	pageLogin =
	{
		root: document.getElementById('pageLogin'),
		main: document.getElementById('loginMain'),
		loading: document.getElementById('loginLoading'),
		errorText: document.getElementById('loginError'),
		inputs:
		{
			username: document.getElementById('inputUsername'),
			serverAddress: document.getElementById('inputServer')
		}
	}

	pageGame =
	{
		root: document.getElementById('pageGame'),
		callCard: document.getElementById('gamePlayedCallCard'),
		gameInfo: document.getElementById('gameInfo'),
		lastPlayedCard: document.getElementById('lastPlayedCard'),
		lastPlayedCardUsername: document.getElementById('lastPlayedCardUsername'),

		gameCards: []
	}

	for(let i = 0; i < 7; i++)
		pageGame.gameCards.push(document.getElementById('gameCard' + (i + 1)))

	statusText = document.getElementById('connectionStatus')
	statusText.innerHTML = 'Status: disconnected'

	setupDragAndDrop()
	logout()

	document.getElementById('inputUsername').value = localStorage.getItem('username')
	document.getElementById('inputServer').value = localStorage.getItem('serverAddress')
}

window.onbeforeunload = () => disconnect()
