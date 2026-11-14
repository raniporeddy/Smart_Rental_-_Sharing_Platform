"""Lightweight, database-grounded AI helpers for the rental API."""

import os
import threading
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps
from sklearn.ensemble import IsolationForest, RandomForestRegressor
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .extensions import db
from .models import Booking, Category, CategoryPricing, Product, ProductImage, Review, SearchHistory


CONDITION_FACTOR = {"New": 1.12, "Like New": 1.0, "Good": 0.84, "Fair": 0.66}
SUBCATEGORY_DAILY_PRIORS = {
    "laptops": 900, "cameras": 800, "audio equipment": 500, "gaming consoles": 600,
    "projectors": 700, "bicycles": 300, "cars": 3000, "scooters & motorbikes": 900,
    "musical instruments": 450, "books & textbooks": 100, "online course access": 250,
    "tools & lab equipment": 500, "furniture": 600, "kitchen appliances": 450,
    "cleaning equipment": 350, "home improvement tools": 400, "party supplies": 350,
    "audio & dj equipment": 1200, "lighting & decorations": 500, "event tents & seating": 1000,
    "fitness equipment": 500, "outdoor sports gear": 350, "water sports gear": 500,
    "team sports equipment": 250, "winter sports gear": 700,
}
SUBCATEGORY_PARENTS = {
    "laptops": "electronics", "cameras": "electronics", "audio equipment": "electronics",
    "gaming consoles": "electronics", "projectors": "electronics", "bicycles": "vehicles",
    "cars": "vehicles", "scooters & motorbikes": "vehicles", "musical instruments": "education",
    "books & textbooks": "education", "online course access": "education", "tools & lab equipment": "education",
    "furniture": "home & furniture", "kitchen appliances": "home & furniture",
    "cleaning equipment": "home & furniture", "home improvement tools": "home & furniture",
    "party supplies": "events", "audio & dj equipment": "events", "lighting & decorations": "events",
    "event tents & seating": "events", "fitness equipment": "sports", "outdoor sports gear": "sports",
    "water sports gear": "sports", "team sports equipment": "sports", "winter sports gear": "sports",
}


class AIEngine:
    def __init__(self):
        self._lock = threading.RLock()
        self._price_model = None
        self._vectorizer = None
        self._listing_anomaly_model = None
        self._booking_anomaly_model = None
        self._seeded_category_averages = {}
        self._mobilenet = None
        self._mobilenet_decoder = None

    def initialize(self, app=None):
        """Train deterministic synthetic baselines and enrich them from MySQL when available."""
        with self._lock:
            seeded = []
            if app is not None:
                with app.app_context():
                    try:
                        categories = Category.query.all()
                        category_by_id = {category.id: category for category in categories}
                        priors = CategoryPricing.query.all()
                        for row in priors:
                            category = category_by_id.get(row.category_id)
                            parent = category_by_id.get(category.parent_category) if category and category.parent_category else category
                            if category and parent:
                                seeded.append((parent.name, category.name, float(row.median_daily_price),
                                               float(row.median_retail_value)))
                        for row in priors:
                            self._seeded_category_averages[row.category_id] = float(row.median_daily_price)
                        averages = (db.session.query(Product.category_id, db.func.avg(Product.price_per_day))
                                    .filter(Product.is_removed.is_(False), Product.is_approved.is_(True),
                                            Product.is_flagged_fraud.is_(False))
                                    .group_by(Product.category_id).all())
                        self._seeded_category_averages = {int(category_id): float(avg)
                                                          for category_id, avg in averages if avg is not None}
                        seeded.extend((parent.name, category.name, float(avg), float(avg) * 42)
                                      for category_id, avg in averages if avg is not None
                                      for category in categories if category.id == category_id
                                      for parent in [category_by_id.get(category.parent_category) if category.parent_category else category]
                                      if parent is not None)
                    except Exception as exc:
                        try:
                            db.session.rollback()
                        except Exception:
                            pass
                        app.logger.warning("AI pricing will use synthetic category priors: %s", exc)
            self._train_price_model(seeded)
            self._train_listing_anomaly_model()
            self._train_booking_anomaly_model()

    def _train_price_model(self, seeded_averages):
        rng = np.random.default_rng(84)
        rows, targets = [], []
        for subcategory, daily_prior in SUBCATEGORY_DAILY_PRIORS.items():
            category = SUBCATEGORY_PARENTS[subcategory]
            # Priors and conditions create realistic INR daily rates around each subcategory's market range.
            typical_retail = max(2500, daily_prior * 42)
            for _ in range(36):
                condition = str(rng.choice(list(CONDITION_FACTOR)))
                retail = float(typical_retail * rng.uniform(0.45, 2.1))
                rate_ratio = rng.uniform(0.012, 0.047)
                price = daily_prior * CONDITION_FACTOR[condition] * rng.uniform(0.76, 1.25)
                price = 0.58 * price + 0.42 * retail * rate_ratio
                rows.append({"category": category, "subcategory": subcategory,
                             "condition": condition, "retail_value": retail})
                targets.append(max(20, price))
        for category, subcategory, observed_daily_rate, observed_retail in seeded_averages:
            for condition, factor in CONDITION_FACTOR.items():
                for retail_factor in (0.65, 1.0, 1.4):
                    rows.append({"category": category.lower(), "subcategory": subcategory.lower(),
                                 "condition": condition,
                                 "retail_value": max(1000, observed_retail * retail_factor)})
                    targets.append(observed_daily_rate * factor)
        self._vectorizer = DictVectorizer(sparse=False)
        features = self._vectorizer.fit_transform(rows)
        self._price_model = RandomForestRegressor(n_estimators=110, min_samples_leaf=2,
                                                  random_state=84, n_jobs=1)
        self._price_model.fit(features, np.asarray(targets, dtype=float))

    def _train_booking_anomaly_model(self):
        rng = np.random.default_rng(11)
        normal = np.column_stack((rng.poisson(0.8, 1400), rng.integers(0, 90, 1400),
                                  rng.integers(1, 15, 1400), rng.lognormal(7.0, 1.1, 1400)))
        self._booking_anomaly_model = IsolationForest(contamination=0.025, random_state=11,
                                                       n_estimators=100)
        self._booking_anomaly_model.fit(normal)

    def _train_listing_anomaly_model(self):
        rng = np.random.default_rng(25)
        deposit_ratios = rng.lognormal(0.2, 0.65, 1800)
        deposit_ratios[rng.random(1800) < 0.25] = 0.0
        normal = np.column_stack((rng.lognormal(0.0, 0.42, 1800), rng.integers(0, 4, 1800),
                                  deposit_ratios))
        self._listing_anomaly_model = IsolationForest(contamination=0.025, random_state=25,
                                                       n_estimators=100)
        self._listing_anomaly_model.fit(normal)

    def predict_price(self, category, subcategory, condition, retail_value):
        if condition not in CONDITION_FACTOR:
            raise ValueError("condition_status must be New, Like New, Good, or Fair")
        retail = float(retail_value)
        if not np.isfinite(retail) or retail <= 0 or retail > 100_000_000:
            raise ValueError("estimated_retail_value must be between 0 and 100000000")
        with self._lock:
            if self._price_model is None:
                self._train_price_model([])
            row = {"category": str(category).strip().lower(),
                   "subcategory": str(subcategory or category).strip().lower(),
                   "condition": condition, "retail_value": retail}
            estimate = float(self._price_model.predict(self._vectorizer.transform([row]))[0])
        estimate = max(1.0, min(estimate, retail * 0.15))
        spread = max(25.0, estimate * 0.20)
        deposit = min(retail * 0.50, max(estimate * 3.0, retail * 0.15))
        return {"recommended_daily_price": round(estimate, 2),
                "min_range": round(max(1.0, estimate - spread), 2),
                "max_range": round(estimate + spread, 2),
                "recommended_deposit": round(deposit, 2), "currency": "INR"}

    def category_price_baseline(self, category_id):
        category = db.session.get(Category, category_id)
        if not category:
            return None, None
        observed = self._seeded_category_averages.get(category.id)
        live = (db.session.query(db.func.avg(Product.price_per_day))
                .filter(Product.category_id == category.id, Product.is_removed.is_(False),
                        Product.is_approved.is_(True), Product.is_flagged_fraud.is_(False)).scalar())
        if live is not None:
            observed = float(live)
        if observed and observed > 0:
            return observed, "live category listing average"
        pricing = db.session.get(CategoryPricing, category.id)
        if pricing:
            return float(pricing.median_daily_price), "seeded category pricing average"
        key = category.name.lower()
        if category.parent_category:
            key = category.name.lower()
        prior = SUBCATEGORY_DAILY_PRIORS.get(key)
        if prior is None and not category.parent_category:
            sub_priors = [SUBCATEGORY_DAILY_PRIORS.get(child.name.lower())
                          for child in Category.query.filter_by(parent_category=category.id).all()]
            sub_priors = [value for value in sub_priors if value]
            prior = float(np.mean(sub_priors)) if sub_priors else None
        return (prior, "synthetic category pricing prior") if prior else (None, None)

    def assess_listing(self, category_id, daily_price, condition, security_deposit=0):
        baseline, source = self.category_price_baseline(category_id)
        if not baseline:
            return None
        if daily_price > baseline * 3:
            return f"Daily price is over 3x the {source} of INR {baseline:.2f} for this category."
        if daily_price < baseline * 0.15:
            return f"Daily price is below 0.15x the {source} of INR {baseline:.2f} for this category."
        condition_index = list(CONDITION_FACTOR).index(condition) if condition in CONDITION_FACTOR else 2
        deposit_ratio = float(security_deposit) / max(float(daily_price), 1.0)
        feature = np.asarray([[float(daily_price) / baseline, condition_index, deposit_ratio]], dtype=float)
        if self._listing_anomaly_model is not None and self._listing_anomaly_model.predict(feature)[0] < 0:
            return "IsolationForest flagged an unusual price, condition, or security-deposit combination for this category."
        return None

    def assess_booking_velocity(self, recent_count, lead_days, duration_days, total_payable):
        vector = np.asarray([[recent_count, lead_days, duration_days, total_payable]], dtype=float)
        anomalous = self._booking_anomaly_model is not None and self._booking_anomaly_model.predict(vector)[0] < 0
        if recent_count >= 4:
            return f"Rapid booking activity: {recent_count} requests created by this account in the last 10 minutes."
        if anomalous:
            return "Booking request has an unusual combination of request frequency, schedule, duration, or amount."
        return None

    @staticmethod
    def _image_descriptor(image):
        image = ImageOps.exif_transpose(image).convert("RGB")
        small = image.resize((32, 32))
        pixels = np.asarray(small, dtype=np.float32) / 255.0
        histogram = []
        for channel in range(3):
            counts, _ = np.histogram(pixels[:, :, channel], bins=16, range=(0, 1), density=True)
            histogram.extend(counts.astype(np.float32))
        gray = small.convert("L").filter(ImageFilter.FIND_EDGES).resize((12, 12))
        edges = np.asarray(gray, dtype=np.float32).reshape(-1) / 255.0
        descriptor = np.concatenate((np.asarray(histogram), edges))
        norm = np.linalg.norm(descriptor)
        return descriptor / norm if norm else descriptor

    def _load_mobilenet(self):
        if self._mobilenet is not None:
            return True
        candidate = os.getenv("AI_MOBILENET_WEIGHTS")
        if not candidate:
            cache_dir = Path.home() / ".keras" / "models"
            candidate = str(cache_dir / "mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224.h5")
        if not os.path.isfile(candidate):
            return False
        try:
            from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2, decode_predictions, preprocess_input
            self._mobilenet = MobileNetV2(weights=candidate)
            self._mobilenet_decoder = (decode_predictions, preprocess_input)
            return True
        except Exception:
            self._mobilenet = None
            return False

    def _classify_with_mobilenet(self, image, categories):
        if not self._load_mobilenet():
            return None
        aliases = {
            "laptop": ("Electronics", "Laptops"), "notebook": ("Electronics", "Laptops"),
            "camera": ("Electronics", "Cameras"), "projector": ("Electronics", "Projectors"),
            "headphone": ("Electronics", "Audio Equipment"), "speaker": ("Electronics", "Audio Equipment"),
            "console": ("Electronics", "Gaming Consoles"), "bicycle": ("Vehicles", "Bicycles"),
            "mountain bike": ("Vehicles", "Bicycles"), "car": ("Vehicles", "Cars"),
            "jeep": ("Vehicles", "Cars"), "scooter": ("Vehicles", "Scooters & Motorbikes"),
            "moped": ("Vehicles", "Scooters & Motorbikes"), "guitar": ("Education", "Musical Instruments"),
            "piano": ("Education", "Musical Instruments"), "book": ("Education", "Books & Textbooks"),
            "sofa": ("Home & Furniture", "Furniture"), "chair": ("Home & Furniture", "Furniture"),
            "microwave": ("Home & Furniture", "Kitchen Appliances"),
            "vacuum": ("Home & Furniture", "Cleaning Equipment"), "tent": ("Events", "Event Tents & Seating"),
            "microphone": ("Events", "Audio & DJ Equipment"), "spotlight": ("Events", "Lighting & Decorations"),
            "dumbbell": ("Sports", "Fitness Equipment"), "volleyball": ("Sports", "Team Sports Equipment"),
            "racket": ("Sports", "Team Sports Equipment"), "snowmobile": ("Sports", "Winter Sports Gear"),
        }
        decode_predictions, preprocess_input = self._mobilenet_decoder
        resampling = getattr(Image, "Resampling", Image).LANCZOS
        image = ImageOps.exif_transpose(image).convert("RGB").resize((224, 224), resampling)
        batch = np.expand_dims(np.asarray(image, dtype=np.float32), 0)
        predictions = decode_predictions(self._mobilenet.predict(preprocess_input(batch), verbose=0), top=5)[0]
        for _label_id, label, probability in predictions:
            label = label.replace("_", " ").lower()
            mapping = next((value for word, value in aliases.items() if word in label), None)
            if mapping:
                category = next((c for c in categories if c.name.lower() == mapping[0].lower()
                                 and c.parent_category is None), None)
                subcategory = next((c for c in categories if c.name.lower() == mapping[1].lower()
                                    and category and c.parent_category == category.id), None)
                if category:
                    return {"category_id": subcategory.id if subcategory else category.id,
                            "category": category.name,
                            "subcategory": subcategory.name if subcategory else None,
                            "confidence": round(float(probability), 4), "method": "MobileNetV2",
                            "matched_label": label}
        return None

    def classify_image(self, image_file):
        try:
            image = Image.open(image_file.stream if hasattr(image_file, "stream") else image_file)
            image.load()
        except Exception as exc:
            raise ValueError("Uploaded file is not a readable image") from exc
        categories = Category.query.all()
        semantic = self._classify_with_mobilenet(image.copy(), categories)
        if semantic:
            return semantic
        descriptor = self._image_descriptor(image)
        candidates = []
        base_dir = Path(__file__).parent / "static" / "uploads"
        rows = (db.session.query(ProductImage, Product.category_id)
                .join(Product, Product.id == ProductImage.product_id)
                .filter(Product.is_approved.is_(True), Product.is_removed.is_(False),
                        Product.is_flagged_fraud.is_(False)).limit(2500).all())
        for image_row, category_id in rows:
            try:
                file_name = os.path.basename(image_row.image_url.split("?", 1)[0])
                path = base_dir / file_name
                with Image.open(path) as reference:
                    similarity = float(cosine_similarity([descriptor], [self._image_descriptor(reference)])[0][0])
                candidates.append((similarity, category_id))
            except (OSError, ValueError):
                continue
        if not candidates:
            return {"category_id": None, "category": None, "subcategory": None,
                    "confidence": 0.0, "method": "Pillow visual matching",
                    "message": "No local reference photos are available yet; choose a category manually."}
        score, matched_id = max(candidates, key=lambda pair: pair[0])
        matched = db.session.get(Category, matched_id)
        if not matched:
            return {"category_id": None, "category": None, "subcategory": None,
                    "confidence": 0.0, "method": "Pillow visual matching",
                    "message": "No reliable category match was found; choose a category manually."}
        parent = db.session.get(Category, matched.parent_category) if matched.parent_category else matched
        subcategory = matched if matched.parent_category else None
        return {"category_id": matched.id, "category": parent.name if parent else matched.name,
                "subcategory": subcategory.name if subcategory else None,
                "confidence": round(score, 4), "method": "Pillow visual matching",
                "message": "Matched against previously listed product photos."}

    def recommend(self, user_id=None, limit=12):
        products = (Product.query.filter_by(is_available=True, is_approved=True, is_removed=False,
                                            is_flagged_fraud=False).order_by(Product.created_at.desc())
                    .limit(1500).all())
        if not products:
            return []
        category_ids = {p.category_id for p in products}
        category_names = {c.id: c.name for c in Category.query.filter(Category.id.in_(category_ids)).all()}
        documents = [f"{p.title} {p.title} {category_names.get(p.category_id, '')} {p.description} {p.location}"
                     for p in products]
        vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=12000, min_df=1)
        matrix = vectorizer.fit_transform(documents)
        product_indexes = {product.id: index for index, product in enumerate(products)}
        content_scores = np.zeros(len(products), dtype=float)
        collaborative_scores = np.zeros(len(products), dtype=float)
        booked_ids = []
        search_terms = []
        if user_id:
            booked_ids = [row[0] for row in db.session.query(Booking.product_id)
                          .filter(Booking.renter_id == user_id,
                                  Booking.status.in_(["Confirmed", "Active", "Returned", "Completed"])).all()]
            search_terms = [row.query_text for row in SearchHistory.query.filter_by(user_id=user_id)
                            .order_by(SearchHistory.created_at.desc()).limit(30).all()]
            if booked_ids:
                in_history = [product_indexes[item_id] for item_id in set(booked_ids) if item_id in product_indexes]
                if in_history:
                    content_scores += np.asarray(cosine_similarity(matrix, matrix[in_history]).mean(axis=1)).reshape(-1)
                shared_users = [row[0] for row in db.session.query(Booking.renter_id)
                                .filter(Booking.product_id.in_(booked_ids), Booking.renter_id != user_id,
                                        Booking.status.in_(["Confirmed", "Active", "Returned", "Completed"]))
                                .distinct().limit(500).all()]
                if shared_users:
                    related = (db.session.query(Booking.product_id, db.func.count(Booking.id))
                               .filter(Booking.renter_id.in_(shared_users), Booking.product_id.notin_(booked_ids),
                                       Booking.status.in_(["Confirmed", "Active", "Returned", "Completed"]))
                               .group_by(Booking.product_id).all())
                    related_counts = {product_id: count for product_id, count in related}
                    maximum = max(related_counts.values(), default=1)
                    for product_id, count in related_counts.items():
                        if product_id in product_indexes:
                            collaborative_scores[product_indexes[product_id]] = count / maximum
            if search_terms:
                search_vector = vectorizer.transform(search_terms)
                content_scores += np.asarray(cosine_similarity(matrix, search_vector).mean(axis=1)).reshape(-1)
        booked_counts = dict(db.session.query(Booking.product_id, db.func.count(Booking.id))
                             .filter(Booking.product_id.in_([p.id for p in products]),
                                     Booking.status.in_(["Confirmed", "Active", "Returned", "Completed"]))
                             .group_by(Booking.product_id).all())
        review_averages = dict(db.session.query(Review.product_id, db.func.avg(Review.rating))
                               .filter(Review.product_id.in_([p.id for p in products]))
                               .group_by(Review.product_id).all())
        trending = np.asarray([booked_counts.get(p.id, 0) + 0.5 * float(review_averages.get(p.id, 0) or 0)
                               for p in products], dtype=float)
        if trending.max(initial=0) > 0:
            trending /= trending.max()
        if content_scores.max(initial=0) > 0:
            content_scores /= content_scores.max()
        scores = 0.58 * content_scores + 0.27 * collaborative_scores + 0.15 * trending
        if user_id:
            previously_booked = set(booked_ids)
            for index, product in enumerate(products):
                if product.owner_id == user_id or product.id in previously_booked:
                    scores[index] = -1
        order = np.argsort(-scores)[:limit]
        return [{"product": product, "score": round(float(scores[index]), 4),
                 "reason": "Based on your bookings and searches" if user_id and (content_scores[index] or collaborative_scores[index])
                 else "Popular with the community"} for index in order if scores[index] >= 0]


AI_ENGINE = AIEngine()
