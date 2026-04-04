import { initDb, closeDb } from "./connection";

console.log("Initializing StudySync database...");
initDb();
console.log("Database initialized successfully.");
closeDb();
