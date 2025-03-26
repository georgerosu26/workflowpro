"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = __importDefault(require("mongoose"));
var AIResponseSchema = new mongoose_1.default.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    sessionId: {
        type: String,
        required: true,
    },
    userId: {
        type: String,
        required: true,
    },
    rawResponse: {
        type: String,
        required: true,
    },
    formattedResponse: {
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
AIResponseSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});
var AIResponse = mongoose_1.default.models.AIResponse || mongoose_1.default.model('AIResponse', AIResponseSchema);
exports.default = AIResponse;
