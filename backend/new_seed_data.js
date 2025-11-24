
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import Class from './models/Class.js';
import Subject from './models/Subject.js';
import Faculty from './models/Faculty.js';
import Combo from './models/Combo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in the backend directory
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI not found in .env file.');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'timetable_jayanth', // Replace if your DB name is different
      serverSelectionTimeoutMS: 30000
    });
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ Mongoose connection error:', err);
    process.exit(1);
  }
};

const combosData = [
    { subject: 'ENGLISH', teacher: 'ARD', ipu: true, iipu: true },
    { subject: 'ENGLISH', teacher: 'ML', ipu: true, iipu: true },
    { subject: 'ENGLISH', teacher: 'SPN', ipu: true, iipu: false },
    { subject: 'ENGLISH', teacher: 'NK', ipu: true, iipu: false },
    { subject: 'KANNADA', teacher: 'KSG', ipu: true, iipu: true },
    { subject: 'KANNADA', teacher: 'MN', ipu: true, iipu: true },
    { subject: 'KANNADA', teacher: 'ASK', ipu: true, iipu: true },
    { subject: 'PHYSICS', teacher: 'BRV', ipu: false, iipu: true },
    { subject: 'PHYSICS', teacher: 'SN', ipu: true, iipu: true },
    { subject: 'PHYSICS', teacher: 'MS', ipu: true, iipu: true },
    { subject: 'PHYSICS', teacher: 'USA', ipu: true, iipu: true },
    { subject: 'CHEMISTRY', teacher: 'VM', ipu: true, iipu: true },
    { subject: 'CHEMISTRY', teacher: 'VV', ipu: true, iipu: true },
    { subject: 'CHEMISTRY', teacher: 'SG', ipu: true, iipu: true },
    { subject: 'CHEMISTRY', teacher: 'JK', ipu: true, iipu: true },
    { subject: 'MATHS', teacher: 'NNK', ipu: false, iipu: true },
    { subject: 'MATHS', teacher: 'YPN', ipu: true, iipu: true },
    { subject: 'MATHS', teacher: 'RM', ipu: true, iipu: true },
    { subject: 'MATHS', teacher: 'RSK', ipu: true, iipu: false },
    { subject: 'MATHS', teacher: 'SMS', ipu: true, iipu: false },
    { subject: 'BIOLOGY', teacher: 'MHK', ipu: true, iipu: true },
    { subject: 'BIOLOGY', teacher: 'HN', ipu: true, iipu: true },
    { subject: 'BIOLOGY', teacher: 'SRP', ipu: true, iipu: true },
    { subject: 'COMPUTER SCIENCE', teacher: 'ANB', ipu: true, iipu: true },
    { subject: 'COMPUTER SCIENCE', teacher: 'TNR', ipu: true, iipu: true },
    { subject: 'COMPUTER SCIENCE', teacher: 'ATP', ipu: true, iipu: false },
    { subject: 'COMPUTER SCIENCE', teacher: 'SJ', ipu: true, iipu: false },
    { subject: 'ACCOUNTANCY', teacher: 'SPB', ipu: true, iipu: true },
    { subject: 'ACCOUNTANCY', teacher: 'GCS', ipu: true, iipu: true },
    { subject: 'ACCOUNTANCY', teacher: 'RNK', ipu: true, iipu: true },
    { subject: 'ECONOMICS', teacher: 'SRK', ipu: true, iipu: true },
    { subject: 'ECONOMICS', teacher: 'NM', ipu: true, iipu: true },
    { subject: 'ECONOMICS', teacher: 'GS', ipu: true, iipu: true },
    { subject: 'BUSINESS STUDIES', teacher: 'GCV', ipu: true, iipu: true },
    { subject: 'BUSINESS STUDIES', teacher: 'RP', ipu: true, iipu: true },
    { subject: 'BUSINESS STUDIES', teacher: 'KLG', ipu: true, iipu: true },
    { subject: 'HINDI', teacher: 'RM', ipu: true, iipu: true },
];

const seedNewCombos = async () => {
    await connectDB();

    try {
        console.log('Fetching data from DB...');
        const subjects = await Subject.find({});
        const faculties = await Faculty.find({});
        const classes = await Class.find({});
        const existingCombos = await Combo.find({});
        console.log(`Found ${subjects.length} subjects, ${faculties.length} faculties, ${classes.length} classes, ${existingCombos.length} existing combos.`);

        const ipuClasses = classes.filter(c => c.id && c.id.toLowerCase().startsWith('j')).map(c => c._id);
        const iipuClasses = classes.filter(c => c.id && c.id.toLowerCase().startsWith('s')).map(c => c._id);
        console.log(`Found ${ipuClasses.length} 'I PU' classes (starting with 'j').`);
        console.log(`Found ${iipuClasses.length} 'II PU' classes (starting with 's').`);

        for (const comboData of combosData) {
            const subject = subjects.find(s => s.name.toUpperCase() === comboData.subject.toUpperCase());
            const faculty = faculties.find(f => f.id === comboData.teacher);

            if (!subject) {
                console.warn(`[Warning] Subject not found for: "${comboData.subject}". Skipping.`);
                continue;
            }
            if (!faculty) {
                console.warn(`[Warning] Faculty not found for ID: "${comboData.teacher}". Skipping.`);
                continue;
            }

            const comboExists = existingCombos.some(c => 
                c.faculty_id.equals(faculty._id) && c.subject_id.equals(subject._id)
            );

            if (comboExists) {
                console.log(`[Skipped] Combo for ${faculty.name} (${faculty.id}) and ${subject.name} already exists.`);
                continue;
            }

            let class_ids = [];
            if (comboData.ipu) {
                class_ids.push(...ipuClasses);
            }
            if (comboData.iipu) {
                class_ids.push(...iipuClasses);
            }
            
            // Get unique class IDs
            const unique_class_ids = [...new Set(class_ids.map(id => id.toString()))].map(id => new mongoose.Types.ObjectId(id));

            if (unique_class_ids.length > 0) {
                const newCombo = new Combo({
                    faculty_id: faculty._id,
                    subject_id: subject._id,
                    class_ids: unique_class_ids,
                    combo_name: `${subject.name} - ${faculty.name}`
                });

                await newCombo.save();
                console.log(`[Created] New combo for ${faculty.name} (${faculty.id}) and ${subject.name} with ${unique_class_ids.length} classes.`);
            } else {
                console.log(`[Info] No matching PU classes found for combo ${faculty.name} (${faculty.id}) and ${subject.name}. Not creating.`);
            }
        }
    } catch (error) {
        console.error('An error occurred during the seeding process:', error);
    } finally {
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed.');
    }
};

seedNewCombos();
