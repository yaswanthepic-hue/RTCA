// You would run this on MongoDB Atlas or connect to your database
// This is just a reference script
const mongoose = require('mongoose');

mongoose.connect('YOUR_MONGODB_URI').then(async () => {
  const User = mongoose.model('User', new mongoose.Schema({
    username: String,
    email: String
  }));
  
  const users = await User.find({}, 'username email');
  console.log('Existing users:', users);
  mongoose.disconnect();
});
