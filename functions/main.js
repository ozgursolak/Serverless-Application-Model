const axios = require("axios");

const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const SQS = new AWS.SQS();

const TABLE_NAME = "watermarks";
const ETSY_URL = "https://openapi.etsy.com/v3/application/listings/active?limit=1&offset=0&sort_on=updated&sort_order=desc";
const ETSY_KEY = "aoyk8hhaufrb0sin8ahlsces";

async function handler(event, context)
{
    const updatedAtEtsy = await getETSYLastProductUpdatedAt();
    const lastWatermark = await getTheLastWatermark();

    if(updatedAtEtsy > lastWatermark)
    {
        const sqsParams = {
           "DelaySeconds": 10,
           "MessageAttributes": {
            "Title": {
                "DataType": "String",
                "StringValue": "ETSY Product Update Timestamp"
            },
            "Author": {
                "DataType": "String",
                "StringValue": "Özgür Solak"
            },
           },
           "MessageBody": "Change last updatedAt in DB",
           "QueueUrl": "https://sqs.us-east-1.amazonaws.com/528707909685/SampleQueue"
        };

        await SQS.sendMessage(sqsParams, function(err, data) {
            if (err) {
              console.log("Error", err);
            } else {
              console.log("Success messageId:", data.MessageId);
            }
        }).promise();
    }
   
    context.done(null, {"updatedAt": updatedAtEtsy}); 
}

async function workerHandler(event, context)
{
    const updatedAtEtsy = await getETSYLastProductUpdatedAt();

    await docClient.transactWrite({
        TransactItems: [
          {
            Update: {
              ConditionExpression: `#updatedAt < :updatedAt`,
              ExpressionAttributeNames: { "#updatedAt": "updatedAt" },
              ExpressionAttributeValues: {
               ":updatedAt": updatedAtEtsy,
              },
              Key: {
               id: 'product',
              },
              TableName: TABLE_NAME,
              UpdateExpression: "SET #updatedAt = :updatedAt",
              },
            },
          ],
        }).promise();
    
    context.done(null, event); 
}

async function getTheLastWatermark()
{
    const queryParams = {
		"TableName": TABLE_NAME,
        "Limit": 1,
        "KeyConditionExpression": "id = :id",
        "ScanIndexForward": false,
        "ExpressionAttributeValues": {
			":id": "products",
		},
	};

	const dbItems = await docClient.query(queryParams).promise();
    const lastWatermark = dbItems.Items[0].updatedAt;

    return lastWatermark;
}

async function getETSYLastProductUpdatedAt()
{
    const params = {
        "headers": {
            "x-api-key": ETSY_KEY
        }
    };

    const response = await axios.get(ETSY_URL, params);

    return response.data.results[0].updated_timestamp;
}

module.exports.handler = handler;
module.exports.workerHandler = workerHandler;