import { app } from './src/app';
import { config } from './src/config/env';
import { connectDB, disconnectDB } from './src/config/database';

let server: any;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    server = app.listen(config.port, () => {
      console.log(`=========================================`);
      console.log(`🚀 BlueCollar AI Backend Service Running`);
      console.log(`📡 Port: ${config.port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`🔗 Allowed Frontend Origin: ${config.frontendUrl}`);
      console.log(`=========================================`);
    });
  } catch (error) {
    console.error('Failed to start server due to database connection error:', error);
    process.exit(1);
  }
};

const handleShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Gracefully shutting down BlueCollar AI backend...`);
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed.');
      await disconnectDB();
      process.exit(0);
    });
  } else {
    await disconnectDB();
    process.exit(0);
  }

  setTimeout(() => {
    console.error('Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startServer();
