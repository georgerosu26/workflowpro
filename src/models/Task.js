"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = __importDefault(require("mongoose"));
var TaskSchema = new mongoose_1.default.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium',
    },
    category: {
        type: String,
        required: true,
        default: 'general',
    },
    status: {
        type: String,
        enum: ['todo', 'in-progress', 'done'],
        default: 'todo',
    },
    sessionId: {
        type: String,
        required: true,
    },
    aiResponseId: {
        type: String,
        required: true,
    },
    userId: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
});
// Update the updatedAt timestamp before saving
TaskSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});
// Create indexes for better query performance
TaskSchema.index({ userId: 1 });
TaskSchema.index({ sessionId: 1 });
TaskSchema.index({ aiResponseId: 1 });
TaskSchema.index({ status: 1 });
var Task = mongoose_1.default.models.Task || mongoose_1.default.model('Task', TaskSchema);
exports.default = Task;
