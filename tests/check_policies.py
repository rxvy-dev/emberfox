#!/usr/bin/env python3
"""Validate settings/distribution/policies.json against Firefox's policy schema.

  check_policies.py [schema.json]
Without an argument, downloads the schema from Firefox's current release branch.
Needs: pip install jsonschema
"""
import json
import os
import sys
import urllib.request

from jsonschema import Draft7Validator

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = ("https://raw.githubusercontent.com/mozilla-firefox/firefox/release/"
       "browser/components/enterprisepolicies/schemas/policies-schema.json")

if len(sys.argv) > 1:
    schema = json.load(open(sys.argv[1]))
else:
    with urllib.request.urlopen(URL, timeout=30) as r:
        schema = json.load(r)


def fix(o):  # Firefox uses a few non-standard type names
    if isinstance(o, dict):
        if o.get("type") in ("URL", "URLorEmpty", "JSON"):
            o["type"] = "string"
        for v in o.values():
            fix(v)
    elif isinstance(o, list):
        for v in o:
            fix(v)


fix(schema)
policies = json.load(open(os.path.join(ROOT, "settings/distribution/policies.json")))["policies"]
bad = 0
for name, value in policies.items():
    if name not in schema["properties"]:
        print(f"unknown policy: {name}"); bad += 1; continue
    sub = dict(schema["properties"][name]); sub["definitions"] = schema.get("definitions", {})
    for err in Draft7Validator(sub).iter_errors(value):
        print(f"{name}: {err.message}"); bad += 1
print(f"{len(policies)} policies checked, {bad} problems")
sys.exit(1 if bad else 0)
