const express = require('express');
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/', auth, userController.getUsers);
router.get('/:id', auth, userController.getUserById);
router.get('/search/:query', auth, userController.searchUsers);

module.exports = router;