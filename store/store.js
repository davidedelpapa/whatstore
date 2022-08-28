'use strict';
const log = require('loglevel');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const fetch = require('node-fetch');
const redis = require('redis');
const uuid = require('uuid');
const redis_cli = redis.createClient({
    url: `redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

module.exports = class Store {
    constructor() { 
        this.connected = false;
        this.store_info = {};
    }

    async setup() {
        try {
            this._connect();
            this.store_info = await redis_cli.json.get('store:info');
            console.log(`Whatstore for ${this.store_info.title}`);
        }
        catch (e) {
            log.error(e);
        }  
    }

    async _connect() {
        try{
            if (!this.connected ){
                await redis_cli.connect();
                this.connected = true;
            }  
        }
        catch (e) {
            log.error(e);
        }      
    }

    async getProductById(productId) {
        try {
            this._connect();
        return await redis_cli.json.get('product:' + productId);
        }
        catch (e) {
            log.error(e);
        }
    }
    async getAllCategories() {
        try{
            this._connect();
            let cat_keys = await redis_cli.keys('category:*');
            let categories = [];
            categories = await Promise.all(cat_keys.map(async (category) => {
                return await redis_cli.json.get(category);
            }));
            return categories;
        }
        catch (e) {
            log.error(e);
        }
    }
    async getProductsInCategory(categoryId) {
        try {
            this._connect();
            let selected_category = await redis_cli.json.get('category:' + categoryId);
            let category_products = selected_category.products;
            let products = [];
            products = await Promise.all(category_products.map(async (id) => {
                return await redis_cli.json.get('product:' + id);
            }));
            return products;
        }
        catch (e) {
            log.error(e);
        }
    }

    async generateInvoice({ order, file_path }) {
        try {
            const doc = new PDFDocument();
            doc.pipe(fs.createWriteStream(file_path));
            doc.fontSize(25);
            let logo = await fetch(`${this.store_info.logo}`).then(res => res.buffer());
            doc.image(logo, {
                align: 'center',
                valign: 'top'
            });
            doc.moveDown();
            doc.text("Invoice");
            doc.moveDown();
            doc.fontSize(18);
            doc.text(order);
            doc.end();
            return;
        }
        catch (e) {
            log.error(e);
        }
    }

    async stashPurchase({ final_bill, recipient_phone}){
        try {
            this._connect();
            let { total, cart }  = final_bill;
            let timestamp = new Date().toLocaleString();
            let pendingOrders = await this.getPendingOrders();
            let order = {
                user: recipient_phone,
                total: total,
                time: timestamp,
                purchased: cart
            };
            pendingOrders.push(order);
            await redis_cli.json.set('pending_orders', '$.orders', pendingOrders);
            return pendingOrders.length - 1;
        }
        catch (e) {
            log.error(e);
        }
    }

    async savePurchase(order, order_id){
        try {
            this._connect();
            const currentYear = new Date().getFullYear();
            let orders = await redis_cli.json.get('pending_orders', '$');
            await redis_cli.json.set('purchase:' + currentYear + ':' + uuid.v4(), '$', order);
            orders.orders.splice(order_id, 1);
            await redis_cli.json.set('pending_orders', '$', orders);
        }
        catch (e) {
            log.error(e);
        }
    }

    async getPendingOrders(){
        try {
            this._connect();
            let pending = await redis_cli.json.get('pending_orders', '$');
            return pending.orders;
        }
        catch (e) {
            log.error(e);
        }
    }
};