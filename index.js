// Puppeteer
const puppeteer = require('puppeteer');

// Firebase
const firebase = require('firebase');
const app = firebase.initializeApp({
	apiKey: process.env.apiKey,
	authDomain: process.env.authDomain,
	databaseURL: process.env.databaseURL,
	projectId: process.env.projectId,
	storageBucket: process.env.storageBucket,
	messagingSenderId: process.env.messagingSenderId
});

// Environment
const UID = process.env.userID;
const WAIT_BETWEEN_REQ = process.env.WAIT_BETWEEN_REQ || 1800;

// User agent
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:55.0) Gecko/20100101 Firefox/55.0'

// Flights to search
let search_flights = [];

// Slack
const Slack = require('slack-node');
const slack = new Slack();


// Format to pt_BR
function toCurrency(num) {
    let n = num.toFixed(2).replace('.',',');

    if (num >= 1000 && num < 10000) {
        return n.substring(0, 1) + '.' + n.substring(1);
    }
    if (num >= 10000 && num < 100000) {
        return n.substring(0, 2) + '.' + n.substring(2);
    }
    return n;
}


async function run() {
	let webhookFound = false;
	search_flights.length = 0;

	try {
		const query = firebase.database().ref().child('flights').child(UID).orderByChild('index');
		query.once('value', snap => {

			snap.forEach(childSnap => {
				if (childSnap.key != 'email' && childSnap.key != 'photo' && childSnap.key != 'webhook') {
					search_flights.push(childSnap);
				} else {
					// Set slack webhook
					if (childSnap.key == 'webhook') {
						if (childSnap.val()) {
							slack.setWebhook(childSnap.val());
							webhookFound = true;
						}
					}
				}
			});

		}).then(async () => {

			for (var i = 0; i < search_flights.length; i++) {
				try {
					const key = search_flights[i].key;
					const from = search_flights[i].child('from').val();
					const to = search_flights[i].child('to').val();
					const start = search_flights[i].child('dtStart').val();
					const end = search_flights[i].child('dtEnd').val();
					const adult = search_flights[i].child('adult').val();
					const child = search_flights[i].child('child').val();
					const price = search_flights[i].child('price').val();
					const nonStop = search_flights[i].child('nonStop').val();
					const roundTrip = search_flights[i].child('roundTrip').val();

					console.log(`${key}, ${price}`);

					// Open browser and page
					const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });
				  const page = await browser.newPage();
				  page.setUserAgent(USER_AGENT);

				  // Departure and return dates
				  let dtDep = start.substring(0,2) + '-' + start.substring(3,5) + '-' + start.substring(6);
				  let dtRet = end.substring(0,2) + '-' + end.substring(3,5) + '-' + end.substring(6);

					// URL target
					let target;
					if (roundTrip) {
						target = `https://www.viajanet.com.br/busca/voos-resultados#/${from}/${to}/RT/${dtDep}/${dtRet}/-/-/-/${adult}/${child}/0/${nonStop ? 'NS' : '-'}/-/-/-`;
					} else {
						target = `https://www.viajanet.com.br/busca/voos-resultados#/${from}/${to}/OW/${dtDep}/-/-/${adult}/${child}/0/${nonStop ? 'NS' : '-'}/-/-/-`;
						//https://www.viajanet.com.br/busca/voos-resultados#/REC/MAD/OW/22-07-2018/-/-/2/2/0/NS/-/-/-
					}
					console.log(target);

					// Goto page
				   await page.goto(target, { timeout: 45000 });

				   // Wait price load
					await page.waitForSelector('div.allprice-highlighted.ng-scope span.price.ng-binding.ng-scope', { visible: true, timeout: 45000 });

					// Wait price matrix load
					await page.waitForSelector('div#matriz3x3.tabs-matriz.display-block ul li.matriz', { visible: true, timeout: 45000 });
				   
				   // Get content
				   let content = await page.evaluate(() => {
				   	return {
				   		price: document.querySelector('div.allprice-highlighted.ng-scope span.price.ng-binding.ng-scope').textContent,
				   		cia: document.querySelector('ul.resultados li.resultado-fluxo.opened.ng-scope div.flights ul.ng-scope.ida li.flight.ng-scope.flight-ida label.btn-voo div.list-cias div.cia.ng-scope span.cia__name.ng-binding.ng-scope').textContent,
				   		idaHoraSaida: document.querySelector('div#vn-content-view.vn-content.content-view.ng-scope div.fluxo-content flight-detail ul.resultados li.resultado-fluxo.opened.ng-scope div.flights ul.ng-scope.ida li.flight.ng-scope.flight-ida label.btn-voo p.departure strong.ng-binding').textContent,
				      idaParadas: document.querySelector('div#vn-content-view.vn-content.content-view.ng-scope div.fluxo-content flight-detail ul.resultados li.resultado-fluxo.opened.ng-scope div.flights ul.ng-scope.ida li.flight.ng-scope.flight-ida label.btn-voo div.time span.stops.ng-scope').textContent,
				      idaDuracao: document.querySelector('div#vn-content-view.vn-content.content-view.ng-scope div.fluxo-content flight-detail ul.resultados li.resultado-fluxo.opened.ng-scope div.flights ul.ng-scope.ida li.flight.ng-scope.flight-ida label.btn-voo div.time span.time.ng-binding').textContent,
				      voltaHoraSaida: document.querySelector('div#vn-content-view.vn-content.content-view.ng-scope div.fluxo-content flight-detail ul.resultados li.resultado-fluxo.opened.ng-scope div.flights ul.ng-scope.volta li.flight.ng-scope.flight-volta label.btn-voo p.departure strong.ng-binding').textContent,
				      voltaParadas: document.querySelector('div#vn-content-view.vn-content.content-view.ng-scope div.fluxo-content flight-detail ul.resultados li.resultado-fluxo.opened.ng-scope div.flights ul.ng-scope.volta li.flight.ng-scope.flight-volta label.btn-voo div.time span.stops.ng-scope').textContent,
				      voltaDuracao: document.querySelector('div#vn-content-view.vn-content.content-view.ng-scope div.fluxo-content flight-detail ul.resultados li.resultado-fluxo.opened.ng-scope div.flights ul.ng-scope.volta li.flight.ng-scope.flight-volta label.btn-voo div.time span.time.ng-binding').textContent
				   	}
				   });

				   // Show content
				   if (content) {
				   	console.log(`preco: ${content.price}, cia: ${content.cia}`);
				   	let prc = parseFloat(content.price.substring(3).replace('.','').replace(',','.'));

				   	if (prc < parseFloat(price)) {
				   		if (webhookFound) {
					   		// Slack message
					   		slack.webhook({
		                     channel: "#general",
		                     username: "webhookbot",
		                     icon_emoji: ":airplane:",
		                     text: `De ${from} para ${to} por *R$${toCurrency(prc)}* pela ${content.cia} para ${adult} adulto(s) e ${child} criança(s).\nIda em ${start} às ${content.idaHoraSaida}, ${content.idaParadas} e ${content.idaDuracao} de duração.\nVolta em ${end} às ${content.voltaHoraSaida}, ${content.voltaParadas} e ${content.voltaDuracao} de duração.`
		                  }, function(err, response) {
		                     if (err) {
		                        console.log(`Ocorreu o seguinte erro: ${err}`);
		                     }
		                  });
				   		} else {
				   			console.log('webhook not found');
				   		}
				   	}

					} else {
						console.log('nenhum resultado encontrado');
					}

					// Close browser
				   await browser.close();
				} catch (err) {
					console.log(`(1) Ocorreu o seguinte erro: ${err}`);
				}
			}
		
		});

	} catch (err) {
		console.log(`(2) Ocorreu o seguinte erro: ${err}`);
  }

}

// Run once before loop
run();

// Infinite loop
(function loop() {
    let ms = WAIT_BETWEEN_REQ * 1000;
    let rand = Math.round(Math.random() * ms) + ms; // de 1ms a 2ms
    console.log(`aguardando ${rand}ms`);
    setTimeout(function() {
        run();
        loop();
    }, rand);
}());