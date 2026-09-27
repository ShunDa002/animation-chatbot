indices = {
    'remu01': 0, 'remu02': 1, 'remu03': 2, 'remu04': 3, 'remu05': 4,
    'remu21': 5, 'remu22': 6, 'remu23': 7, 'remu24': 8, 'remu25': 9,
    'remu26': 10, 'remu06': 11, 'remu07': 12, 'remu08': 13, 'remu09': 14,
    'remu10': 15, 'remu11': 16, 'remu12': 17, 'remu13': 18, 'remu14': 19,
    'remu15': 20, 'remu16': 21, 'remu17': 22, 'remu18': 23, 'remu19': 24,
    'remu20': 25, 'remu27': 26, 'remu28': 27, 'remu29': 28, 'remu30': 29,
    'remu31': 30, 'remu32': 31, 'remu33': 32, 'remu34': 33, 'remu_idle': 34
}

happy = ["remu02", "remu07", "remu12", "remu18", "remu33", "remu_idle"]
angry = ["remu03", "remu09", "remu10", "remu17", "remu22", "remu25", "remu29"]
sad = ["remu20", "remu21", "remu23", "remu19"]
shy = ["remu06", "remu14", "remu15", "remu24", "remu28", "remu31"]
neutral = ["remu01", "remu04", "remu05", "remu08", "remu11", "remu13", "remu16", "remu26", "remu27", "remu30", "remu32", "remu34"]

print("Happy:", [indices[x] for x in happy])
print("Angry:", [indices[x] for x in angry])
print("Sad:", [indices[x] for x in sad])
print("Shy:", [indices[x] for x in shy])
print("Neutral:", [indices[x] for x in neutral])

strong = set([indices[x] for x in happy + angry + sad + shy])
print("Strong:", sorted(list(strong)))
