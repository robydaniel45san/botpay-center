const { Router } = require('express');
const { login, logout, me, changePassword } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.post('/login',            login);
router.post('/logout',           authenticate, logout);
router.get('/me',                authenticate, me);
router.patch('/change-password', authenticate, changePassword);

module.exports = router;
