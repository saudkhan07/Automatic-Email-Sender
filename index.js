const express = require("express");
const path = require("path");
const { authenticate } = require("@google-cloud/local-auth");
const colors = require("colors");
const { google } = require("googleapis");

const app = express();

//scope of gmail api's
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
];

const labelName = "Vacation-Mails";

app.get("/api", async (req, res) => {
  const auth = await authenticate({
    keyfilePath: path.join(__dirname, "credentials.json"),
    scopes: SCOPES,
  });
  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.labels.list({
    userId: "me",
  });

  // getting unreplied messgaes
  async function getUnrepliesMessages(auth) {
    console.log("unreplied messages function hit");
    const gmail = google.gmail({ version: "v1", auth });
    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "-in:chats -from:me -has:userlabels",
    });
    return response.data.messages || [];
  }
  // adding the label to the mail sent
  async function addLabel(auth, message, labelId) {
    const gmail = google.gmail({ version: "v1", auth });
    await gmail.users.messages.modify({
      userId: "me",
      id: message.id,
      requestBody: {
        addLabelIds: [labelId],
        removeLabelIds: ["INBOX"],
      },
    });
  }

  // creating a new Label
  async function createLabel(auth) {
    console.log("Function createlabel got hitted");
    const gmail = google.gmail({ version: "v1", auth });
    try {
      const response = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      return response.data.id;
    } catch (error) {
      if (error.code === 409) {
        const response = await gmail.users.labels.list({
          userId: "me",
        });
        const label = response.data.labels.find(
          (label) => label.name === labelName
        );
        return label.id;
      } else {
        throw error;
      }
    }
  }

  async function sendReply(auth, message) {
    console.log("Function sendReply got hitted");
    const gmail = google.gmail({ version: "v1", auth });
    const res = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From"],
    });
    const subject = res.data.payload.headers.find(
      (header) => header.name === "Subject"
    ).value;
    const from = res.data.payload.headers.find(
      (header) => header.name === "From"
    ).value;
    const replyTo = from.match(/<(.*)>/)[1];
    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const replyBody = `Hi, \n\nI'm currently on vacation and will get back to you soon. If the matter is very urgent then you can reach me directly on my mobile at 9390xxxxxx \n\nBest, \nSaud Ahmed Khan`;
    const rawMessage = [
      `From: me`,
      `To: ${replyTo}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${message.id}`,
      `References: ${message.id}`,
      "",
      replyBody,
    ].join("\n");
    const encodedMessage = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });
  }

  async function main() {
    const labelId = await createLabel(auth);
    console.log(`New Label has been created with id as ${labelId}`.green);
    setInterval(async () => {
      const messages = await getUnrepliesMessages(auth);
      console.log(`${messages.length} unreplied messages found`);

      for (const message of messages) {
        await sendReply(auth, message);
        console.log(
          `Succesfully sent reply to the message with id ${message.id}`.green
        );

        await addLabel(auth, message, labelId);
        console.log(
          `Succesfully added label to the message with id ${message.id}`.green
        );
      }
    }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000); // Random interval between 45 and 120 seconds
  }

  main().catch(console.error);
});

app.listen(8080, () => {
  console.log(`Server is running on port 8080`.bgGreen);
});
