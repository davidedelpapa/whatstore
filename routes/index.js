'use strict';
const log = require('loglevel');
const router = require('express').Router();

const WhatsappCloudAPI = require('whatsappcloudapi_wrapper');
const Whatsapp = new WhatsappCloudAPI({
    accessToken: process.env.WA_ACCESS_TOKEN,
    senderPhoneNumberId: process.env.WA_SENDER_PHONENUMBER_ID,
    WABA_ID: process.env.WA_BUSINESS_APP_ID,
});


const eStore = require('../store/store.js');
let Store = new eStore();
Store.setup();

const UserSession = require('./../store/user_session.js');
let Session = new UserSession();
Session.connect();

// WA Subscription Callback
router.get('/whatsapp/callbackurl', (req, res) => {
    try {
        let mode = req.query['hub.mode'];
        let token = req.query['hub.verify_token'];
        let challenge = req.query['hub.challenge'];

        if (
            mode &&
            token &&
            mode === 'subscribe' &&
            process.env.WA_VERIFY_TOKEN === token
        ) {
            console.log("Callback URL Verified");
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    } 
    catch (error) {
        log.error({error})
        return res.sendStatus(500);
    }
});

router.post('/whatsapp/callbackurl', async (req, res) => {
    try {
        let data = Whatsapp.parseMessage(req.body);

        if (data?.isMessage) {
            // Parse Message Info
            let incoming_msg = data.message;
            let recipient_phone = incoming_msg.from.phone; 
            let recipient_name = incoming_msg.from.name;
            let msg_type = incoming_msg.type; 
            let msg_id = incoming_msg.msg_id; 

            Session.addUser(recipient_phone);

            // CART Functions
            let addtoCart = async ({ recipient_phone, product_id }) => {
                let product = await Store.getProductById(product_id);
                Session.addToCart(recipient_phone, product);
            };

            //COMMON FUNCTIONS
            let reviewPendingOrders = async (recipient_phone) => {
                let pending_orders = await Store.getPendingOrders();
                if (pending_orders.length === 0){
                    await Whatsapp.sendText({
                        message: 'There are no pending orders.',
                        recipientPhone: recipient_phone,
                    });
                }
                else {
                    let pendingOrders = [
                        {
                            title: "Pending Orders",
                            rows: pending_orders.slice(0, 10).map((order, index) => ({
                                title: `${order.user.slice(0, 20)}`,
                                id: `pending_order_${index}`,
                                description: `Time: ${order.time}, total: ${order.total}`
                            }))
                        }
                    ];
                    await Whatsapp.sendRadioButtons({
                        headerText: 'Pending Orders',
                        bodyText: `Hi! There are ${pending_orders,this.length} order(s) waiting.`,
                        footerText: 'Review them here',
                        recipientPhone: recipient_phone, 
                        listOfSections: pendingOrders,
                    });
                }
            };

            // LIST OF ACTIONS
            let speak_to_human = {
                title: '💬 Speak to a human',
                id: 'speak_to_human',
            };
            let view_products = {
                title: '🛍️ View products',
                id: 'see_categories',
            };
            let checkout = {
                title: '💳 Checkout',
                id: 'checkout',
            };
            let review_cart = {
                title: '🔄 Review cart',
                id: 'review_cart',
            };
            let modify_cart = {
                title: '🔄 Modify cart',
                id: 'modify_cart',
            };
            let review_pending = {
                title: 'See pending orders',
                id: 'review_pending',
            };

            // INIT Message
            if (msg_type === 'text_message') {
                // SELLER Phone
                if ( recipient_phone == process.env.SELLER_PHONE && process.env.ONE_PHONE != 'ON'){
                    await reviewPendingOrders(recipient_phone);
                }
                // BUYER Phone
                else {
                    await Whatsapp.sendSimpleButtons({
                        message: `Hi ${recipient_name}, \nYou are speaking with a chatbot.\nWhat do you want to do next?`,
                        recipientPhone: recipient_phone, 
                        listOfButtons: [
                            view_products,
                            speak_to_human,
                        ],
                    });
                }
            }

            if (msg_type === 'simple_button_message') {
                let button_id = incoming_msg.button_reply.id;

                // SPEAK TO HUMAN Functions
                if (button_id === 'speak_to_human') {
                    await Whatsapp.sendText({
                        recipientPhone: recipient_phone,
                        message: 'Call customer care service using the below details:',
                    });
                    await Whatsapp.sendContact({
                        recipientPhone: recipient_phone,
                        contact_profile: Store.store_info.contact_card,
                    });
                }

                // SEE CATEGORIES Functions
                if (button_id === 'see_categories') {
                    let categories = await Store.getAllCategories(); 

                    let listOfCategories = [
                        {
                            title: "Our Categories",
                            rows: categories.slice(0, 10).map((category) => ({
                                title: `${category.title.slice(0, 20)}`,
                                id: `category_${category.id.split('category:')[1].slice(0, 11)}`,
                                description: category.description
                            }))
                        }
                    ];

                    await Whatsapp.sendRadioButtons({
                        recipientPhone: recipient_phone,
                        headerText: `Product Categories`,
                        bodyText: 'We have several product categories.',
                        footerText: 'Please, choose a category:',
                        listOfSections: listOfCategories,
                    });
                }

                // ADD TO CART Functions
                if (button_id.startsWith('add_to_cart_')) {
                    let product_id = button_id.split('add_to_cart_')[1];
                    await addtoCart({ recipient_phone, product_id });
                    
                    await Whatsapp.sendSimpleButtons({
                        message: `Your cart has been updated.\nWhat do you want to do next?`,
                        recipientPhone: recipient_phone, 
                        listOfButtons: [
                            review_cart,
                            view_products,
                        ],
                    });
                }

                // REVIEW CART Functions
                if (button_id === 'review_cart') {
                    let cart = await Session.getCart(recipient_phone);

                    let cartText = `List of items in your cart:\n`;
                    cart.cart.forEach((item, index) => {
                        let serial = index + 1;
                        cartText += `\n#${serial}: ${item.title} @ $${item.price}`;
                    });
                    cartText += `\n\nTotal: $${cart.total}`;

                    await Whatsapp.sendText({
                        message: cartText,
                        recipientPhone: recipient_phone,
                    });

                    await Whatsapp.sendSimpleButtons({
                        recipientPhone: recipient_phone,
                        message: `What do you want to do next?`,
                        msg_id,
                        listOfButtons: [
                            checkout,
                            modify_cart,
                            view_products,
                        ],
                    });
                }

                // MODIFY CART Functions
                if (button_id === 'modify_cart') {
                    let cart = await Session.getCart(recipient_phone);

                    let products = cart.cart;

                    let prod_list = [];
                    products.forEach((product, index) => {
                        let id = index;
                        let title = product.title.substring(0,21);
                        let description = `${product.price}\n${product.description}`.substring(0,68);
                    
                        prod_list.push({
                            id: `cartprod_${id}`,
                            title: `${title}...`,
                            description: `$${description}...`
                        });
                    });

                    await Whatsapp.sendRadioButtons({
                        recipientPhone: recipient_phone,
                        headerText: 'Cart Content',
                        bodyText: `Here you cand find all products inside the Cart: `,
                        footerText: 'Please select one of the products below:',
                        listOfSections: [
                            {
                                title: "Products in Cart",
                                rows: prod_list.slice(0, 10)
                            },
                        ],
                    });

                }

                // DELETE PRODUCT FROM CART Functions
                if (button_id.startsWith('delprod_')) {
                    let product_id = button_id.split('delprod_')[1];

                    await Session.deleteFromCart(recipient_phone, product_id);
                    let list_items = await Session.getCart(recipient_phone);
                    let numberOfItemsInCart = list_items.cart.length;

                    if (list_items.cart.length === 0){
                        await Whatsapp.sendSimpleButtons({
                            message: `Your cart is empty.\nWhat do you want to do next?`,
                            recipientPhone: recipient_phone, 
                            listOfButtons: [
                                view_products,
                                speak_to_human
                            ],
                        });
                    } 
                    else {                    
                        await Whatsapp.sendSimpleButtons({
                            message: `Your cart has been updated.\nNumber of items in cart: ${numberOfItemsInCart}.\n\nWhat do you want to do next?`,
                            recipientPhone: recipient_phone, 
                            listOfButtons: [
                                review_cart,
                                view_products,
                            ],
                        });
                    }
                }

                // CHECKOUT Functions
                if (button_id === 'checkout') {
                    let finalBill = await Session.getCart(recipient_phone);
                    let invoiceText = `List of items in your cart:\n`;

                    finalBill.cart.forEach((item, index) => {
                        let serial = index + 1;
                        invoiceText += `\n#${serial}: ${item.title} @ $${item.price}`;
                    });
                  
                    invoiceText += `\n\nTotal: $${finalBill.total}`;
                    let invoicePath = `./invoice_${recipient_name}.pdf`;
                  
                    await Whatsapp.sendText({
                        recipientPhone: recipient_phone,
                        message: `Your order has been fulfilled.\nCome and pick it up here:`,
                    });

                    let warehouse = Store.store_info.location;
                    await Whatsapp.sendLocation({
                        recipientPhone: recipient_phone,
                        latitude: warehouse.latitude,
                        longitude: warehouse.longitude,
                        address: warehouse.address,
                        name: `${Store.store_info.title}`,
                    });
                  
                    await Whatsapp.sendText({
                        message: invoiceText,
                        recipientPhone: recipient_phone,
                    });

                    await Store.generateInvoice({
                        order: invoiceText,
                        file_path: invoicePath,
                    });

                    await Whatsapp.sendDocument({
                        recipientPhone: recipient_phone,
                        caption:`${Store.store_info.title} invoice`,
                        file_path: invoicePath,
                    });

                    let stashed = await Store.stashPurchase({
                        final_bill: finalBill,
                        recipient_phone: recipient_phone,
                    });
                    Session.emptyCart(recipient_phone);
                  
                    await Whatsapp.sendSimpleButtons({
                        recipientPhone: recipient_phone,
                        message: `Thank you for shopping with us, ${recipient_name}.\n\nYour order has been received & will be processed shortly.\n\nYou can now close this chat or continue shopping.`,
                        msg_id,
                        listOfButtons: [
                            view_products,
                            speak_to_human,
                        ],
                    });

                    await Whatsapp.sendSimpleButtons({
                        recipientPhone: process.env.SELLER_PHONE,
                        message: `New pending order\n${invoiceText}`,
                        msg_id,
                        listOfButtons: [
                            {
                                title: 'Order ready in...',
                                id: `delay_order_${stashed}`,
                            },
                            {
                                title: 'Fulfill order',
                                id: `fulfill_${stashed}`,
                            },
                            review_pending,
                        ],
                    });

                }

                // FULFILL ORDER Functions
                if (button_id.startsWith('fulfill_')) {
                    let order_id = button_id.split('fulfill_')[1];
                    let orders = await Store.getPendingOrders();
                    let current_order = orders[parseInt(order_id)];
                    await Store.savePurchase(current_order, order_id);
                    
                    await Whatsapp.sendSimpleButtons({
                        message: `Order fulfilled.\nWhat do you want to do next?`,
                        recipientPhone: recipient_phone, 
                        listOfButtons: [
                            review_pending,
                        ],
                    });
                }

                // READY IN.. Functions
                if (button_id.startsWith('delay_order_')) {
                    let order_to_delay= button_id.split('delay_order_')[1];
                    let pending_orders = await Store.getPendingOrders();

                    let user_to_contact = pending_orders[parseInt(order_to_delay)].user;

                    await Whatsapp.sendSimpleButtons({
                        message: `Order will be ready in..`,
                        recipientPhone: recipient_phone, 
                        listOfButtons: [
                            {
                                title: '10 minutes',
                                id: `alertuser_${user_to_contact}_10`,
                            },
                            {
                                title: '30 minutes',
                                id: `alertuser_${user_to_contact}_30`,
                            },
                            {
                                title: '1 hour',
                                id: `alertuser_${user_to_contact}_60`,
                            },
                        ],
                    });
                }

                // ALERT USER function
                if (button_id.startsWith('alertuser_')) {
                    let user = button_id.split('_')[1];
                    let time = button_id.split('_')[2];

                    await Whatsapp.sendText({
                        message: `Your order will be ready in ${time} minutes`,
                        recipientPhone: user,
                    });

                    await Whatsapp.sendText({
                        message: `Client notified!`,
                        recipientPhone: recipient_phone,
                    });

                    await reviewPendingOrders(recipient_phone);
                }

                // REVIEW PENDING ORDERS function
                if (button_id.startsWith('review_pending')) {
                    await reviewPendingOrders(recipient_phone);
                }

            };

            if (msg_type === 'radio_button_message') {
                let selectionId = incoming_msg.list_reply.id;

                // SELECTED CATEGORY Functions
                if (selectionId.startsWith('category_')) {
                    let selectedCategory = selectionId.split('_')[1];
                    let listOfProducts = await Store.getProductsInCategory(selectedCategory);
                
                    let listOfSections = [
                        {
                            title: "🏆 Our Top Products",
                            rows: listOfProducts
                                .map((product) => {
                                    let id = `product_${product.id.split('product:')[1]}`
                                    let title = product.title.substring(0,21);
                                    let description = `${product.price}\n${product.description}`.substring(0,68);
                                   
                                    return {
                                        id,
                                        title: `${title}...`,
                                        description: `$${description}...`
                                    };
                                }).slice(0, 10)
                        },
                    ];
                
                    await Whatsapp.sendRadioButtons({
                        recipientPhone: recipient_phone,
                        headerText: 'Our Selected Offers',
                        bodyText: `Here you cand find all products inside the selected category: `,
                        footerText: 'Please select one of the products below:',
                        listOfSections,
                    });
                }
                
                // SELECTED PRODUCT Functions
                if (selectionId.startsWith('product_')) {
                    let product_id = selectionId.split('_')[1];
                    let product = await Store.getProductById(product_id);
                    const { price, title, description, image: imageUrl, rating } = product;
                
                    let emoji_rating = (rating) => {
                        rating = Math.floor(rating || 0);
                        let output = [];
                        for (var i = 0; i < rating; i++) output.push('⭐');
                        return output.length ? output.join('') : 'N/A';
                    };
                
                    let msg = `_Title_: *${title.trim()}*\n\n\n`;
                    msg += `_Description_: ${description.trim()}\n\n\n`;
                    msg += `_Price_: $${price}\n`;
                    msg += `${rating?.count || 0} shoppers rated this product so far.\n`;
                    msg += `_Rated_: ${emoji_rating(rating?.rate)}\n`;
                
                    await Whatsapp.sendImage({
                        recipientPhone: recipient_phone,
                        url: imageUrl,
                        caption: msg,
                    });

                    let listOfButtons = [
                        {
                            title: '🛒 Add to cart',
                            id: `add_to_cart_${product_id}`,
                        },
                        view_products,
                    ];
                    let cart = await Session.getCart(recipient_phone);
                    if (cart.cart.length > 0){
                        listOfButtons.push(review_cart);
                    }
                    await Whatsapp.sendSimpleButtons({
                        message: `Here is the product, what do you want to do next?`,
                        recipientPhone: recipient_phone, 
                        listOfButtons: listOfButtons,
                    });
                }

                // SELECTED CART PRODUCT Functions
                if (selectionId.startsWith('cartprod_')) {
                    let selectedCartProduct = selectionId.split('_')[1];
                    let cart = await Session.getCart(recipient_phone);

                    let selectedProductTitle = cart.cart[selectedCartProduct].title;

                    await Whatsapp.sendSimpleButtons({
                        message: `Product selected:\n ${selectedProductTitle}\nWhat do you want to do next?`,
                        recipientPhone: recipient_phone, 
                        listOfButtons: [
                            {
                                title: '🗙 Delete Product',
                                id: `delprod_${selectedCartProduct}`,
                            },
                            review_cart,
                            view_products,
                        ],
                    });
                }

                // SELECTED PENDING ORDER Functions
                if (selectionId.startsWith('pending_order_')) {
                    let selectedOrder = selectionId.split('pending_order_')[1];
                    let pending_orders = await Store.getPendingOrders();

                    let pending_order = pending_orders[parseInt(selectedOrder)];
                    let order = `List of items in order:\n`;

                    pending_order.purchased.forEach((item, index) => {
                        let serial = index + 1;
                        order += `\n#${serial}: ${item.title} @ $${item.price}`;
                    });
                  
                    order += `\n\nTotal: $${pending_order.total}`;

                    await Whatsapp.sendSimpleButtons({
                        message: `Pending order for ${pending_order.user}\n ${order}\nWhat do you want to do next?`,
                        recipientPhone: recipient_phone, 
                        listOfButtons: [
                            {
                                title: '🗙 Fulfill Order',
                                id: `fulfill_${selectedOrder}`,
                            },
                            {
                                title: '🕓 Order ready in..',
                                id: `delay_order_${selectedOrder}`,
                            },
                            review_pending,
                        ],
                    });
                }


            }
        // Mark message as read
        await Whatsapp.markMessageAsRead({ msg_id });
        }
        return res.sendStatus(200);
    } 
    catch (error) {
        log.error({error})
        return res.sendStatus(500);
    }
});
module.exports = router;
