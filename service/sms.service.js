import twilio from 'twilio';
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const sendVerificationSms = async (phone) => {
  try {
    const verificationResponse = await client.verify
      .services(process.env.TWILIO_SERVICE_SID)
      .verifications.create({body: 'This is the ship that made the Kessel Run in fourteen parsecs?', to: phone, channel: 'sms' });
    return verificationResponse.status;
  } catch (error) {
    return error;
  }
};
const smsService={
    sendVerificationSms
}
export default smsService