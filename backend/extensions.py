from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
jwt = JWTManager()
# In-memory storage — fine for the current single-instance App Runner
# deployment. Switch storage_uri to a Redis URL before running multiple
# instances, or each instance will enforce its own separate limit.
limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
