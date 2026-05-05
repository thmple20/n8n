import logger from "../middlewares/Logger";
// import firebaseAdmin from "./admin";

export default class PushNotification {
  async SinglePushNotifcation(
    user_device_token: string,
    notificationMessage: string,
    type: string,
    userId: string,
    id: string,
    title: string,
    image: string,
  ) {
    console.log("Test ==>", user_device_token);
    console.log("NotificationMessage==>", notificationMessage);
    console.log("Type==>", type);
    console.log("UserId==>", userId);
    console.log("Id==>", id);
    try {
      const sendmessage = {
        data: {
          title: title,
          type: type,
          message: notificationMessage,
          sound: "alert",
          userId: userId,
          id: id,
          image: image,
        },

        notification: {
          title: title,
          body: notificationMessage,
        },
        apns: {
          headers: {
            "apns-priority": "10",
          },
          payload: {
            aps: {
              sound: "Notification sound.wav",
            },
          },
        },
        token: user_device_token,
      };

      // const sent = await firebaseAdmin.messaging().send(sendmessage);

      // if (sent) {
      //   return { notification: 1 };
      // }
      return { notification: 1 };
    } catch (error) {
      console.log("ERror log updated", error);
      logger.error(`${error}`);
      return { notification: 0 };
    }
  }

  //   async SingleDriverPushNotifcation(
  //     user_device_token: string,
  //     notificationMessage: string,
  //     type: string,
  //     userId: string,
  //     id: string,
  //     title:string,
  //     image:string
  //   ) {
  //     console.log("Test ==>", user_device_token);
  //     console.log("NotificationMessage==>", notificationMessage);
  //     console.log("Type==>", type);
  //     console.log("UserId==>", userId);
  //     console.log("Id==>", id);
  //     console.log("title==>", title);
  //     console.log("image==>", image);
  //     try {
  //       const sendmessage = {
  //         data: {
  //           title: title,
  //           type: type,
  //           message: notificationMessage,
  //           sound: "alert",
  //           userId: userId,
  //           id: id,
  //           image:image
  //         },

  //         notification: {
  //           title: "Trucky Driver",
  //           body: notificationMessage,
  //         },
  //         apns: {
  //           headers: {
  //             "apns-priority": "10",
  //           },
  //           payload: {
  //             aps: {
  //               sound: "Notification sound.wav",
  //             },
  //           },
  //         },
  //         token: user_device_token,
  //       };

  //       const sent = await firebaseAdminDriver.messaging().send(sendmessage);

  //       if (sent) {
  //         return { notification: 1 };
  //       }
  //       return { notification: 1 };
  //     } catch (error) {
  //       console.log("ERror log updated", error);
  //       logger.error(`${error}`);
  //       return { notification: 0 };
  //     }
  //   }
}
