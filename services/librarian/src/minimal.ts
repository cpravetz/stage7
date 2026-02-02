import express from 'express';

const app = express();
const port = process.env.PORT || 5040;

// Health checks handled by unified HealthCheckManager from BaseService

app.listen(port, () => {
  console.log(`Librarian (minimal version) listening on port ${port}`);
});
