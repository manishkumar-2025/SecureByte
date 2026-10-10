// bcryptjs implements the bcrypt hashing algorithm in pure JavaScript.
// We use it instead of the native `bcrypt` package because it needs no
// C++ build tools (a common source of setup pain on Windows laptops).
const bcrypt = require('bcryptjs');
const { env } = require('../config/env');

const hashPassword = (plain) => bcrypt.hash(plain, env.bcryptRounds);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

module.exports = { hashPassword, verifyPassword };
