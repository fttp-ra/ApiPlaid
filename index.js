'use strict'
const express = require('express');
const morgan = require('morgan')
const bodyParser = require('body-parser');
const plaid = require('plaid');
const keys = require('./config/keys');
const session = require('express-session');
const chalk = require('chalk');
const log = console.log

//start
const app = express();
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));
app.use(session({
    secret: 'only',
    resave: false
}));
app.set('view engine', 'ejs');

const client = new plaid.Client({
    clientID: keys.CLIENT_ID,
    secret: keys.PLAID_SECRET,
    env: plaid.environments.sandbox
});

log(client);
let linkT;
let publicT;
let accessT_old;
let accessT_new;
let optionsHook = new Object();
optionsHook.webhook = "https://www.domainkiiper.com/webhook"

app.get('/', (req,res) => {
    res.render('pages/index')
})

app.post('/institutions/get', (req,res) => {
    client.getInstitutions(10, 0, ['US'], (err, result) => {
        if(!err){
            res.status(202)
                .json({status: 'confirmed',
                       info: result})
            log(result.institutions)
        }else{
            res.status(402)
                .json({status: 'error',
                       info: err})
        };
    });
});

app.post('/link/token/create', async (req,res) => {
    linkT = req.session;
    const response = await client
  .createLinkToken({
    user: {
      client_user_id: '123-test-user-id',
    },
    client_name: 'Plaid Test App',
    products: ['auth', 'transactions'],
    country_codes: ['US'],
    language: 'en',
    webhook: 'https://plaid-domain-kiiper-web-hook.com',
    account_filters: {
      depository: {
        account_subtypes: ['checking', 'savings'],
      },
    },
  })
  .catch((err) => {
    // handle error
  });
const linkToken = response.link_token;
linkT = linkToken;
    /* res.status(202)
        .json({status: 'approved',
               link_token: linkToken
            }); */
    res.redirect('https://cdn.plaid.com/link/v2/stable/link.html?isWebview=true&token='+`${linkT}`);
})

app.post('/item/public_token/create', async (req,res) => {
    publicT = req.session;
    try {
        const publicTokenResponse = await client.sandboxPublicTokenCreate(
          'ins_117212',
          ['auth', 'transactions'],
          optionsHook,

        );
        const publicToken = publicTokenResponse.public_token
        /* res.status(202)
            .json({type_token: 'public token',
                   token: publicToken}); */
        res.redirect(307, '/item/public_token/exchange');
        publicT = publicToken
    }catch (err) {
        res.status('402')
            .json({status: err})
    }
});

app.post('/item/public_token/exchange', async (req,res) => {
    accessT_old = req.session;
    try {
        const response = await client.exchangePublicToken(publicT);
        const accessToken = response.access_token;
        const itemId = response.item_id;
        /* res.status(202)
            .json({status: 'approved',
                   token: accessToken,
                   item: itemId
                }); */
            res.redirect(307, '/item/access_token/invalidate')
        accessT_old = accessToken;
    } catch (err) {
        res.status(402)
            .json({status: 'error',
                   message: err});
    }
});

app.post('/item/access_token/invalidate', async (req,res) => {
    accessT_new = req.session;

    const response = await client.invalidateAccessToken(accessT_old).catch((err) => {
        if(err){
            res.status(402)
                .json({status: 'error',
                       message: err
                    });
        }
    });

    const accessToken = response.new_access_token;
    /* res.status(202)
        .json({status: 'approved',
               new_token: accessToken
            }); */
        res.redirect(307, '/item/fire_webhooks')
    accessT_new = accessToken;
});

app.post('/item/fire_webhooks', async (req,res) => {
    const response = await client.sandboxItemFireWebhook(accessT_new, 'DEFAULT_UPDATE').catch((err) => {
        res.status(402)
            .json({status: 'error',
                   message: err
                });
    });
    res.status(202)
        .json({status: 'approved',
               data: response
            });
            //res.redirect(307, '/transactions/get');
});

app.post('/transactions/get', async (req, res) => {
    const response = await client.getTransactions(
        accessT_new,
         '2018-01-01',
         '2020-02-01',
          {
              count: 10,
              offset: 0
          })
    .catch((err) => {
        res.status(402)
            .json({status: 'error',
                   message: err
                });
    });
    let transactions = response.transactions;
    const total_transactions = response.total_transactions;
    res.status(202)
        .json({status: 'approved',
               data: transactions,
               total: total_transactions,
            });
    
});


app.post('/auth/get', async (req,res) => {
    const response = await client.getAuth(accessT_new, {})
    .catch((err) => {
        res.status(402)
            .json({status: 'error',
                   message: err
                });
    });
    const accountData = response.accounts;
    const numbers = response.numbers;
    res.status(202)
    .json({status: 'approved',
           account: accountData,
           data: numbers,
        });
});

app.listen(3000, () => log(chalk.cyan('Run server on port 3000')));