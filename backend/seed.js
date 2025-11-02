import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import readline from 'readline';
import Faculty from './models/Faculty.js';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'test2',
      serverSelectionTimeoutMS: 20000
    });
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ Mongoose connection error:', err);
    process.exit(1);
  }
};

const createAdmin = async () => {
  try {
    await connectDB();

    rl.question('Enter admin ID: ', (id) => {
      rl.question('Enter admin name: ', (name) => {
        rl.question('Enter admin email: ', (email) => {
          rl.question('Enter admin password: ', async (password) => {
            const hashedPassword = await bcrypt.hash(password, 10);
            const admin = new Faculty({
              id,
              name,
              email,
              password: hashedPassword,
              role: 'admin'
            });

            try {
              await admin.save();
              console.log('Admin user created successfully');
            } catch (error) {
              console.error('Error creating admin user:', error.message);
            } finally {
              mongoose.connection.close();
              rl.close();
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

createAdmin();
