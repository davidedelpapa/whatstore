const production = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
    // Once in production, just copy the production credentials here
};

const development = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: '9000',
    WA_ACCESS_TOKEN:'',
    WA_SENDER_PHONENUMBER_ID: '',
    WA_BUSINESS_APP_ID: '',
    WA_VERIFY_TOKEN: '',
    REDIS_HOST: '', 
    REDIS_PORT: '',
    REDIS_USER: '',
    REDIS_PASSWORD: '',
    SELLER_PHONE: ''
};

const fallback = {
    ...process.env,
    NODE_ENV: undefined,
};

module.exports = (environment) => {
    console.log(`Execution environment selected is: "${environment}"`);
    if (environment === 'production') {
        return production;
    } else if (environment === 'development') {
        return development;
    } else {
        return fallback;
    }
};
