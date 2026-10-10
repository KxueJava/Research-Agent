"""One temporary point verifies the configured embedding -> Qdrant path; no secrets stored here."""
import uuid
from qdrant_client import models
from research_tool.tool.mrag.embedding.text_embedding import get_text_embedding_model
from research_tool.tool.mrag.storage.vector_store import VectorStore

store = VectorStore()
store.text_store
client = store.base_store.client
collection = store.config.text_collection
point_id = str(uuid.uuid4())
test_scope = "connectivity-check:" + point_id
vector = get_text_embedding_model().encode_text_batch(["Research embedding connectivity test"])[0]
try:
    client.upsert(collection_name=collection, wait=True, points=[models.PointStruct(
        id=point_id, vector={"vector": vector}, payload={"kb_id": test_scope, "text": "Connectivity check"})])
    result = client.query_points(collection_name=collection, query=vector, using="vector", limit=1,
                                 query_filter=models.Filter(must=[models.FieldCondition(
                                     key="kb_id", match=models.MatchValue(value=test_scope))]))
    assert len(result.points) == 1 and str(result.points[0].id) == point_id
    print("Embedding -> Qdrant write/query: OK, dimension=%d" % len(vector))
finally:
    client.delete(collection_name=collection, wait=True, points_selector=models.PointIdsList(points=[point_id]))
    print("Temporary diagnostic point removed")
