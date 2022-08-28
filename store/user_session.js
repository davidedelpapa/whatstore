'use strict'
const redis = require('redis');

const redis_cli = redis.createClient({
    url: `redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});


module.exports = class UserSession {
    constructor() { this.connected= false; }
    
    async connect() {
        if (!this.connected ){
            await redis_cli.connect();
            this.connected = true;
        }        
    }

    async addUser(phone) {        
        if (! await redis_cli.json.get('user:' + phone)) {
            await redis_cli.json.set('user:' + phone, '$', {
                cart: [],
            });
        }
        
    }

    async addToCart (phone, product) {
        let stored = await redis_cli.json.get('user:' + phone, '$.cart');
        stored.cart.push(product);
        await redis_cli.json.set('user:' + phone, '$', stored);
    }

    async deleteFromCart (phone, product) {
        let stored = await redis_cli.json.get('user:' + phone, '$.cart');
        stored.cart.splice(product, 1);
        await redis_cli.json.set('user:' + phone, '$', stored);
    }

    async emptyCart(phone) {
        await redis_cli.json.set('user:' + phone, '$.cart', []);
    }

    async getCart(phone) {
        let stored = await redis_cli.json.get('user:' + phone);
        let cart = stored.cart;
        let total = 0;
        total = cart.reduce((a, e) => a + e.price, total);
        return { total, cart};
    }

}