import { verifyJwt } from "../../functions/functions";
import { decryptPass } from "../../validation/poker.validation";


const socketsAuthentication = async (handshake)=>{
    try{
        let token = "";
        let mode = "";
        const cookieData = handshake?.headers?.cookie;
        const cookieDetails = cookieData?.split(";");
        cookieData &&
        cookieDetails?.length > 0 &&
        cookieDetails?.forEach((el) => {
            if (el.includes("token=")) {
            token = el;
            }
            if (el.includes("mode=")) {
            mode = el;
            }
        });
        const tokenForVerify = token?.split("token=")[1];
        let decryptedToken = decryptPass(tokenForVerify);
        const verify = await verifyJwt(decryptedToken);
        return { userId: verify?.sub, success: true };
    }catch(err){
        return new Error('Authentication failed');
    }
}

export default socketsAuthentication;