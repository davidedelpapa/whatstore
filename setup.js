process.env = require('./env.js')(process.env.NODE_ENV || 'development');
const port = process.env.PORT || 9000;
const redis = require('redis');

const redis_cli = redis.createClient({
    url: `redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

//const connect = async () => {}


const populate = async () => {
    await redis_cli.connect();
    const db = require('./store.json');
    for (e of db) {
        console.log(e.id);
        await redis_cli.json.set(e.id, '$', e);
    }
    redis_cli.quit();
}

populate();
