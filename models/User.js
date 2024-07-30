const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' } // Adding role for user
});

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAuthToken = function () {
    const token = jwt.sign(
        { id: this._id, role: this.role },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '1h' }
    );
    return token;
};

module.exports = mongoose.model('User', userSchema);
