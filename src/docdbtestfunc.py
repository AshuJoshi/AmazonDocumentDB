import os
import json
import boto3
import pymongo
# import bson
from bson import json_util, ObjectId
from botocore.exceptions import ClientError
from botocore.client import Config

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths

cors_config = CORSConfig(allow_origin="*")
app = APIGatewayRestResolver(cors=cors_config)

logger = Logger()

db_client = None
inserted_Id = None

pem_locator ='/opt/python/global-bundle.pem'
datetime_str = "%Y-%m-%dT%H:%M:%S"

## Set the following 3 environment variables in your Lambda function configuration
# 1. CLUSTERSM: The name of the secret in AWS Secrets Manager containing DocumentDB credentials.
# 2. DOCDB_DATABASE: The name of DocumentDB database.
# 3. DOCDB_COLLECTION: The name of the DocumentDB collection.

CLUSTERSM = os.environ['CLUSTERSM']
# Retrieve database_name and collection_name from environment variables
database_name = os.environ['DOCDB_DATABASE']
collection_name = os.environ['DOCDB_COLLECTION']

## DOCUMENTDB CREDENTIALS
def get_credentials(secret_name):
    """Retrieve credentials from the Secrets Manager service."""
    boto_session = boto3.session.Session()
    try:
        logger.info('Retrieving secret {} from Secrets Manger.'.format(secret_name))
        secrets_client = boto_session.client(service_name='secretsmanager', region_name=boto_session.region_name)
        secret_value = secrets_client.get_secret_value(SecretId=secret_name)
        secret = secret_value['SecretString']
        secret_json = json.loads(secret)
        username = secret_json['username']
        password = secret_json['password']
        host = secret_json['host']
        port = secret_json['port']
        return (username, password, host, port)
    except Exception as ex:
        raise

## DOCUMENTDB CONNECTION
def get_db_client():
    """Return an authenticated connection to DocumentDB"""
    # Use a global variable so Lambda can reuse the persisted client on future invocations
    global db_client
    if db_client is None:
        try:
            (username, password, docdb_host, docdb_port) = get_credentials(CLUSTERSM)
            db_client = pymongo.MongoClient(
                host=docdb_host, 
                port=docdb_port, 
                tls=True, 
                tlsCAFile=pem_locator, 
                connect=True,
                replicaSet='rs0', 
                readPreference='secondaryPreferred',
                retryWrites=False,
                username=username,
                password=password
            )
            logger.info('Successfully created new DocumentDB client.')
        except Exception as ex:
            raise
    return db_client

@app.post("/test")
def insertDoc():
    global db_client

    db = db_client[database_name]
    collection = db[collection_name]

    # Insert a document
    document = {'name': 'Amazon DocumentDB', 'port': 27017}
    result = collection.insert_one(document)

    logger.info('Inserted document with ID: {}.'.format(result.inserted_id))

    return json_util.dumps(result.inserted_id)

@app.get("/test/<objectid>")
def getDoc(objectid):
    global db_client

    db = db_client[database_name]
    collection = db[collection_name]

    # Read the document
    document_id = ObjectId(objectid)
    retrieved_document = collection.find_one({'_id': document_id})
    logger.info('Retrieved document: {}'.format(retrieved_document))

    return json_util.dumps(retrieved_document)    

@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST, log_event=True)
def handler(event, context):
    get_db_client()
    return app.resolve(event, context)