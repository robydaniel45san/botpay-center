module.exports = {
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_APP_SECRET,
  phoneNumberId: process.env.META_PHONE_NUMBER_ID,
  accessToken: process.env.META_ACCESS_TOKEN,
  webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
  apiVersion: process.env.META_API_VERSION || 'v19.0',
  apiBaseUrl: `https://graph.facebook.com/${process.env.META_API_VERSION || 'v19.0'}`,
};
