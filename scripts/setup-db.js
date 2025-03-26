// MongoDB setup script
db = db.getSiblingDB('workflowpro');

// Drop existing collections if they exist
db.tasks.drop();
db.airesponses.drop();

// Create tasks collection with schema validation
db.createCollection('tasks', {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id", "title", "description", "priority", "category", "status", "sessionId", "aiResponseId"],
      properties: {
        id: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        title: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        description: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        priority: {
          enum: ["low", "medium", "high"],
          description: "must be one of: low, medium, high"
        },
        category: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        status: {
          enum: ["todo", "in-progress", "done"],
          description: "must be one of: todo, in-progress, done"
        },
        sessionId: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        aiResponseId: {
          bsonType: "string",
          description: "must be a string and is required"
        }
      }
    }
  }
});

// Create airesponses collection with schema validation
db.createCollection('airesponses', {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id", "sessionId", "rawResponse", "formattedResponse"],
      properties: {
        id: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        sessionId: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        rawResponse: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        formattedResponse: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        fileInfo: {
          bsonType: "object",
          properties: {
            name: {
              bsonType: "string"
            },
            type: {
              bsonType: "string"
            },
            uri: {
              bsonType: "string"
            }
          }
        }
      }
    }
  }
});

// Create indexes
db.tasks.createIndex({ sessionId: 1 });
db.tasks.createIndex({ aiResponseId: 1 });
db.airesponses.createIndex({ sessionId: 1 });

// Print confirmation
print("Database 'workflowpro' and collections 'tasks' and 'airesponses' have been created with schema validation and indexes."); 