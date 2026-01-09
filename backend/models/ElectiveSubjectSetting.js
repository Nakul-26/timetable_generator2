import mongoose from 'mongoose';

const ElectiveSubjectSettingSchema = new mongoose.Schema({
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    teacherCategoryRequirements: {
        type: Map,
        of: Number,
        required: true
    }
});

// Ensure a unique setting for each class-subject pair
ElectiveSubjectSettingSchema.index({ class: 1, subject: 1 }, { unique: true });

export default mongoose.model('ElectiveSubjectSetting', ElectiveSubjectSettingSchema);
