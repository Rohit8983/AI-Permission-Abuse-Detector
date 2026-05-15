"""
models/classifier.py — Website Category Classifier
Uses TF-IDF + Random Forest trained on URL/title/keyword features
"""

import re
import os
import json
import pickle
import logging
import numpy as np
from typing import Tuple, Dict
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import LabelEncoder

log = logging.getLogger("aipd.classifier")

MODEL_PATH = "data/classifier.pkl"
LABELS_PATH = "data/label_encoder.pkl"

# ─── Training Dataset ─────────────────────────────────────────────────────────
# Each tuple: (combined_text_features, category)

TRAINING_DATA = [
    # Video Conference
    ("zoom zoom.us video meeting conference call webinar screen share", "video_conference"),
    ("meet google.com/meet video call meeting conference video chat hangouts", "video_conference"),
    ("teams microsoft teams video meeting enterprise call collaboration", "video_conference"),
    ("webex cisco video conference call meeting enterprise webinar", "video_conference"),
    ("jitsi jitsi.org video conference open source meeting call", "video_conference"),
    ("whereby video meetings browser conference room", "video_conference"),
    ("skype skype.com video call voice call meeting", "video_conference"),
    ("gotomeeting goto webinar video conference enterprise", "video_conference"),

    # Social Media
    ("facebook facebook.com social network news feed friends profile status", "social_media"),
    ("twitter twitter.com tweets social media trending hashtag news feed", "social_media"),
    ("instagram instagram.com photos social media stories reels followers", "social_media"),
    ("linkedin linkedin.com professional network jobs career business", "social_media"),
    ("tiktok tiktok.com videos short form social media trending creators", "social_media"),
    ("reddit reddit.com forum community posts upvotes comments subreddit", "social_media"),
    ("snapchat snapchat.com snaps stories disappearing messages friends", "social_media"),
    ("pinterest pinterest.com pins boards inspiration ideas images", "social_media"),
    ("discord discord.com gaming community chat voice channels server", "social_media"),

    # E-Commerce / Shopping
    ("amazon amazon.com shop buy purchase product cart checkout order delivery", "e_commerce"),
    ("ebay ebay.com auction buy sell products marketplace listings", "e_commerce"),
    ("shopify shopify.com online store products shop buy cart", "e_commerce"),
    ("etsy etsy.com handmade products shop buy artisan unique gifts", "e_commerce"),
    ("walmart walmart.com shop grocery products buy cart delivery", "e_commerce"),
    ("target target.com shop products buy deals cart checkout", "e_commerce"),
    ("aliexpress aliexpress.com products cheap shop order shipping", "e_commerce"),
    ("product shop buy add to cart checkout price sale discount deal", "e_commerce"),
    ("online store ecommerce shopping retail purchase order", "e_commerce"),

    # Banking / Finance
    ("bank banking account balance transfer wire payment loan mortgage", "banking"),
    ("chase chase.com bank account credit card balance login", "banking"),
    ("wellsfargo wellsfargo.com bank account credit debit transfer", "banking"),
    ("paypal paypal.com payment send receive money wallet transaction", "banking"),
    ("stripe stripe.com payment processing merchant checkout billing", "banking"),
    ("coinbase coinbase.com crypto bitcoin ethereum trading invest", "banking"),
    ("robinhood robinhood.com stocks trading invest portfolio", "banking"),
    ("fidelity fidelity.com invest retirement fund portfolio stocks", "banking"),
    ("credit card loan interest rate finance investment broker", "banking"),

    # News / Media
    ("bbc bbc.com news world breaking latest article report", "news"),
    ("cnn cnn.com news breaking world politics report article", "news"),
    ("nytimes nytimes.com news article opinion world politics", "news"),
    ("theguardian theguardian.com news world politics article report", "news"),
    ("reuters reuters.com news wire service breaking world", "news"),
    ("ap news apnews.com breaking news world latest report", "news"),
    ("news article breaking report latest world politics sports", "news"),
    ("newspaper editorial opinion column press media journalist", "news"),

    # Education
    ("coursera coursera.org online course learn certificate program", "education"),
    ("udemy udemy.com course learn teach video tutorial skill", "education"),
    ("khan academy khanacademy.org free learn math science education", "education"),
    ("edx edx.org university course online certificate program", "education"),
    ("university edu college campus student lecture course degree", "education"),
    ("school classroom teacher student homework assignment grade", "education"),
    ("learn tutorial lesson exercise quiz study education", "education"),
    ("wikipedia wikipedia.org encyclopedia article knowledge reference", "education"),
    ("research paper academic journal study publication science", "education"),

    # Entertainment
    ("youtube youtube.com video watch subscribe channel creator", "entertainment"),
    ("netflix netflix.com movie series stream watch subscription", "entertainment"),
    ("spotify spotify.com music stream playlist podcast listen", "entertainment"),
    ("twitch twitch.tv stream gaming live watch follow", "entertainment"),
    ("hulu hulu.com stream movie series watch subscription", "entertainment"),
    ("disney disney.com movie stream entertainment kids", "entertainment"),
    ("gaming game play multiplayer score level achievement", "entertainment"),
    ("music album artist song listen stream playlist download", "entertainment"),

    # Health / Medical
    ("webmd webmd.com symptoms health medical advice doctor", "health"),
    ("mayo clinic mayoclinic.org health medical treatment symptoms", "health"),
    ("healthline healthline.com health wellness nutrition fitness", "health"),
    ("hospital clinic doctor appointment medical health care", "health"),
    ("pharmacy medication drug prescription health", "health"),
    ("mental health therapy counseling psychology wellness", "health"),
    ("fitness workout exercise diet nutrition calories weight", "health"),

    # Blog / Personal
    ("blog wordpress.com personal blog post article write", "blog"),
    ("medium medium.com write article blog post story", "blog"),
    ("blogger blogger.com blog personal post article", "blog"),
    ("substack substack.com newsletter blog subscribe write", "blog"),
    ("ghost ghost.org blog publish write personal site", "blog"),
    ("personal site portfolio about contact page", "blog"),
    ("journal diary write thoughts experience personal", "blog"),

    # Search Engines
    ("google google.com search query results web find", "search"),
    ("bing bing.com search web results query find", "search"),
    ("duckduckgo duckduckgo.com search privacy results query", "search"),
    ("yahoo search query results find web", "search"),

    # Government
    ("gov government official agency department federal state", "government"),
    ("irs irs.gov tax return file government official", "government"),
    ("dmv license vehicle registration government official", "government"),
    ("census data government official statistics population", "government"),

    # Unknown / Suspicious (minimal info)
    ("page unknown new site", "unknown"),
    ("untitled document", "unknown"),
    ("localhost test debug", "unknown"),
    ("download free click here limited offer", "unknown"),
    ("prize winner claim free gift offer click", "unknown"),
]


class SiteClassifier:
    def __init__(self):
        self.pipeline = None
        self.label_encoder = None
        self.categories = []

    def _build_features(self, data: Dict) -> str:
        """Combine all features into a single text string for classification."""
        parts = [
            data.get("url", ""),
            data.get("domain", ""),
            data.get("title", ""),
            data.get("keywords", ""),
            data.get("meta_desc", ""),
            data.get("meta_kw", ""),
        ]
        combined = " ".join(p for p in parts if p)
        # Clean URL noise
        combined = re.sub(r'https?://', ' ', combined)
        combined = re.sub(r'[/\-_=&?#%+]', ' ', combined)
        combined = re.sub(r'\s+', ' ', combined).lower().strip()
        return combined

    def load_or_train(self):
        """Load existing model or train fresh."""
        os.makedirs("data", exist_ok=True)

        if os.path.exists(MODEL_PATH) and os.path.exists(LABELS_PATH):
            try:
                with open(MODEL_PATH, "rb") as f:
                    self.pipeline = pickle.load(f)
                with open(LABELS_PATH, "rb") as f:
                    self.label_encoder = pickle.load(f)
                self.categories = list(self.label_encoder.classes_)
                log.info(f"✓ Loaded classifier ({len(self.categories)} categories)")
                return
            except Exception as e:
                log.warning(f"Failed to load model: {e}. Retraining...")

        self.train()

    def train(self):
        """Train the classification model on the built-in dataset."""
        log.info("Training site classifier...")

        texts = [self._build_features({
            "url": d[0], "domain": d[0].split()[0], "title": d[0], "keywords": d[0]
        }) for d in TRAINING_DATA]
        labels = [d[1] for d in TRAINING_DATA]

        # Encode labels
        self.label_encoder = LabelEncoder()
        y = self.label_encoder.fit_transform(labels)
        self.categories = list(self.label_encoder.classes_)

        # Build pipeline: TF-IDF + Random Forest
        self.pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(
                ngram_range=(1, 3),
                min_df=1,
                max_features=5000,
                sublinear_tf=True,
                analyzer="word"
            )),
            ("clf", RandomForestClassifier(
                n_estimators=200,
                max_depth=None,
                min_samples_split=2,
                random_state=42,
                n_jobs=-1,
                class_weight="balanced"
            ))
        ])

        X_train, X_test, y_train, y_test = train_test_split(texts, y, test_size=0.2, random_state=42, stratify=y)
        self.pipeline.fit(X_train, y_train)

        # Evaluate
        y_pred = self.pipeline.predict(X_test)
        acc = np.mean(y_pred == y_test)
        log.info(f"✓ Classifier trained | Accuracy: {acc:.1%} | Categories: {len(self.categories)}")

        # Save
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(self.pipeline, f)
        with open(LABELS_PATH, "wb") as f:
            pickle.dump(self.label_encoder, f)

        log.info(f"✓ Model saved to {MODEL_PATH}")

    def predict(self, features: Dict) -> Tuple[str, float]:
        """Classify a website and return (category, confidence)."""
        if self.pipeline is None:
            self.load_or_train()

        text = self._build_features(features)
        if not text.strip():
            return "unknown", 0.5

        # Get probabilities
        proba = self.pipeline.predict_proba([text])[0]
        pred_idx = np.argmax(proba)
        confidence = float(proba[pred_idx])
        category = self.label_encoder.inverse_transform([pred_idx])[0]

        # If confidence is low, fallback to URL-based rules
        if confidence < 0.4:
            rule_category = self._rule_based_fallback(features.get("url", ""), features.get("domain", ""))
            if rule_category != "unknown":
                return rule_category, 0.6

        return category, confidence

    def _rule_based_fallback(self, url: str, domain: str) -> str:
        """Quick URL pattern matching as fallback."""
        text = f"{url} {domain}".lower()

        rules = [
            ("video_conference", ["zoom.us", "meet.google", "teams.microsoft", "webex", "jitsi", "whereby"]),
            ("banking", ["bank", "chase.com", "wellsfargo", "paypal.com", "stripe.com", "schwab"]),
            ("e_commerce", ["amazon", "ebay", "shopify", "etsy", "shop", "store", "cart"]),
            ("social_media", ["facebook", "twitter", "instagram", "linkedin", "tiktok", "reddit"]),
            ("news", ["bbc", "cnn", "nytimes", "guardian", "reuters", "news", "article"]),
            ("education", ["edu", "coursera", "udemy", "khanacademy", "edx", "learn"]),
            ("entertainment", ["youtube", "netflix", "spotify", "twitch", "hulu", "gaming"]),
            ("health", ["webmd", "mayoclinic", "health", "medical", "hospital", "clinic"]),
        ]

        for category, patterns in rules:
            if any(p in text for p in patterns):
                return category

        return "unknown"

    def retrain_with_feedback(self, new_samples: list):
        """Add new labeled samples and retrain the model."""
        log.info(f"Retraining with {len(new_samples)} new samples...")
        # Extend training data and retrain
        global TRAINING_DATA
        TRAINING_DATA.extend(new_samples)
        self.train()

    def model_info(self) -> Dict:
        return {
            "type": "RandomForest + TF-IDF",
            "categories": self.categories,
            "num_categories": len(self.categories),
            "loaded": self.pipeline is not None
        }
