import unittest

from backend.app.legal_engine import analyze_legal_issue, extract_citations


class LegalEngineTest(unittest.TestCase):
    def test_extracts_citations(self):
        found = extract_citations("Mata v. Avianca cited Rule 11 and Article 21.")
        self.assertIn("Mata v. Avianca", found)
        self.assertIn("Rule 11", found)
        self.assertIn("Article 21", found)

    def test_flags_fake_citation(self):
        result = analyze_legal_issue(
            "Varghese v. China Southern Airlines held that ChatGPT citations are sufficient."
        )
        self.assertEqual(result["trust"]["label"], "High Risk")
        self.assertTrue(result["modules"]["citation_verifier"]["unverified"])

    def test_refuses_non_legal_chat(self):
        result = analyze_legal_issue("Write a birthday caption for my friend.")
        self.assertFalse(result["scope"]["in_scope"])
        self.assertEqual(result["trust"]["label"], "High Risk")

    def test_article_21_retrieval(self):
        result = analyze_legal_issue("What does Article 21 say about personal liberty?")
        ids = {source["id"] for source in result["sources"]}
        self.assertIn("india-article-21", ids)


if __name__ == "__main__":
    unittest.main()
