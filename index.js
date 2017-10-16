// Constants
const puppeteer = require('puppeteer');
const Slack = require('slack-node');
const firebase = require('firebase');
const app = firebase.initializeApp({
	apiKey: process.env.apiKey,
	authDomain: process.env.authDomain,
	databaseURL: process.env.databaseURL,
	projectId: process.env.projectId,
	storageBucket: process.env.storageBucket,
	messagingSenderId: process.env.messagingSenderId
});
const UID = process.env.userID;
const WAIT_BETWEEN_REQ = process.env.WAIT_BETWEEN_REQ || 300;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:55.0) Gecko/20100101 Firefox/55.0'

// Flights to search
let search_flights = [];


// Slack webhook
slack = new Slack();
slack.setWebhook(SLACK_WEBHOOK);


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

	try {
		search_flights.length = 0;

		const query = firebase.database().ref().child('flights').child(UID).orderByKey();
		query.once('value', snap => {

			snap.forEach(childSnap => {
				if (childSnap.key != 'email' && childSnap.key != 'photo') {
					search_flights.push(childSnap);
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
					const max = search_flights[i].child('maxDays').val();
					const min = search_flights[i].child('minDays').val();
					const adult = search_flights[i].child('adult').val();
					const child = search_flights[i].child('child').val();
					const price = search_flights[i].child('price').val();
					const nonStop = search_flights[i].child('nonStop').val();

					console.log(`${key}, ${price}`);

					// Open browser and page
					const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });
				   const page = await browser.newPage();
				   page.setUserAgent(USER_AGENT);

					// URL target
					let target = `https://www.viajanet.com.br/busca/voos-resultados#/${from}/${to}/RT/${start}/${end}/-/-/-/${adult}/${child}/0/${nonStop ? 'NS' : '-'}/-/-/-`;
					console.log(target);

					// Goto page
				   await page.goto(target, { timeout: 45000 });

				   // Wait page load
					await page.waitForSelector('div.allprice-highlighted.ng-scope span.price.ng-binding.ng-scope', { visible: true, timeout: 45000 });
				   
				   // Get content
				   let content = await page.evaluate(() => {
				   	return {
				   		price: document.querySelector('div.allprice-highlighted.ng-scope span.price.ng-binding.ng-scope').textContent,
				   		cia: document.querySelector('ul.resultados li.resultado-fluxo.opened.ng-scope div.flights ul.ng-scope.ida li.flight.ng-scope.flight-ida label.btn-voo div.list-cias div.cia.ng-scope span.cia__name.ng-binding.ng-scope').textContent
				   	}
				   });

				   // Show content
				   if (content) {
				   	console.log(`preco: ${content.price}, cia: ${content.cia}`);
				   	let prc = parseFloat(content.price.substring(3).replace('.','').replace(',','.'));
				   	console.log(`${prc} < ${parseFloat(price)}?`);

				   	if (prc < parseFloat(price)) {
				   		// Slack message
				   		slack.webhook({
	                     channel: "#general",
	                     username: "webhookbot",
	                     icon_emoji: ":airplane:",
	                     text: `De ${from} para ${to} pela ${content.cia} por *R$${toCurrency(prc)}* para ${adult} adultos e ${child} crianças.\nIda em ${start} e volta em ${end}.`
	                  }, function(err, response) {
	                     if (err) {
	                        console.log(`Ocorreu o seguinte erro: ${err}`);
	                     }
	                  });
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