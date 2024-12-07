const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    username: { type: String, required: [true, "Username is required"], unique: true },
    password: { type: String, required: [true, "Password is required"] },
    role: { type: String, default: 'user' }
});

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        this.password = await bcrypt.hash(this.password, 10);
        next();
    } catch (error) {
        console.error("Error hashing password:", error);
        next(error); // Passe l'erreur à Mongoose
    }
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
