import dotenv from 'dotenv';

dotenv.config();

export const config = {
  PORT: process.env.PORT ?? '5000',                         
  NODE_ENV: process.env.NODE_ENV ?? 'development',          

  MONGODB_URI: process.env.MONGODB_URI as string,           

  JWT_SECRET: process.env.JWT_SECRET as string,             
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string, 
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? '15m',  
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES ?? '7d', 

  OPENWEATHERMAP_API_KEY: process.env.OPENWEATHERMAP_API_KEY as string, 
  PERSPECTIVE_API_KEY: process.env.PERSPECTIVE_API_KEY as string,       

  BREVO_SMTP_HOST: process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com', 
  BREVO_SMTP_PORT: process.env.BREVO_SMTP_PORT ?? '587',                   
  BREVO_SMTP_USER: process.env.BREVO_SMTP_USER as string,                  
  BREVO_SMTP_PASS: process.env.BREVO_SMTP_PASS as string,                  
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'noreply@solarspot.app',           

  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',       
};
