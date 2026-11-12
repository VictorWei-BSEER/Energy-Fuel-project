"""Independent black-box and exported-artifact audit; not the production model.

Originally authored by a separate technical reviewer. Round-2 revision makes
paths portable, audits the frozen airport archive, and checks the two additive
local-case CSV columns. Prints its report without changing research artifacts.
"""
import csv, hashlib, importlib.util, itertools, json, math
from collections import defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SNAPSHOT=Path(__file__).resolve().with_name('airport-source-snapshot.json')
R=ROOT/'research'
I=json.loads((R/'inputs.json').read_text())
J=json.loads((R/'results.json').read_text())
checks=defaultdict(int)
def near(a,b,tol=2e-9):
    assert math.isclose(float(a),float(b),rel_tol=tol,abs_tol=tol),(a,b)
def yes(v):
    assert v
def rows(path):
    out=list(csv.DictReader(path.open()))
    numeric=['durationH','kPerHour','speedKph','pathFactor','originPriceScenarioUsdPerT','carbonUsdPerTCo2','extraCostUsdPerDeliveredT','requiredDeliveryT','retentionFraction','extraOriginUpliftT','additionalBurnT','additionalCo2T','breakEvenPriceRatio','breakEvenPremiumPct','localGapRequiredT','localExtraOriginHeadroomT','localExtraOriginUsedT','localDestinationUpliftDisplacedT','localGapRemainingT','localAdditionalBurnT','localAdditionalCo2T','sharedQuotaAdditionalUseT','distanceKm']
    for row in out:
        for key in numeric:
            if row.get(key,'')!='': row[key]=float(row[key])
    return out
C=rows(R/'results.csv'); S=rows(R/'sensitivity.csv')
yes(len(C)==36 and len(S)==486)
yes(len({r['id'] for r in S})==486)
yes(hashlib.sha256((R/'inputs.json').read_bytes()).hexdigest()==J['meta']['inputsSha256'])
yes(hashlib.sha256(SNAPSHOT.read_bytes()).hexdigest()==I['airportSnapshot']['snapshotSha256'])
checks['provenance_hashes']=2
snapshot=json.loads(SNAPSHOT.read_text())
snap_airports={a['iata']:a for a in snapshot['airports']}
for airport in I['airports']:
    original=snap_airports[airport['iata']]
    near(airport['lat'],original['lat']); near(airport['lon'],original['lon'])
    yes(airport['icao']==original['icao'])
    checks['frozen_airport_coordinate_matches']+=1
central_by_id={row['id']:row for row in C}
for row in J['durationCases']+J['routeCases']:
    csv_row=central_by_id[row['id']]
    for field in ['durationH','kPerHour','requiredDeliveryT','retentionFraction','extraOriginUpliftT','additionalBurnT','additionalCo2T','breakEvenPriceRatio','breakEvenPremiumPct']:
        near(row[field],csv_row[field])
    near(row['localInterruption']['additionalBurnT'],csv_row['localAdditionalBurnT'])
    near(row['localInterruption']['additionalCo2T'],csv_row['localAdditionalCo2T'])
    checks['json_csv_central_consistency_rows']+=1

# Independent spherical-law-of-cosines geometry versus production haversine.
A={a['iata']:a for a in I['airports']}; distances={}
for route in I['routes']:
    a,b=A[route['origin']],A[route['destination']]
    la,lb=map(math.radians,[a['lat'],b['lat']]); dl=math.radians(a['lon']-b['lon'])
    distances[route['id']]=6371.0088*math.acos(math.sin(la)*math.sin(lb)+math.cos(la)*math.cos(lb)*math.cos(dl))
    for row in [r for r in C+S if r.get('routeId')==route['id']]:
        near(row['distanceKm'],distances[route['id']])
        near(row['durationH'],distances[route['id']]*row['pathFactor']/row['speedKph'])
        checks['route_distance_and_time_rows']+=1
    checks['independent_route_geometries']+=1

for row in C+S:
    t,k,q=row['durationH'],row['kPerHour'],row['requiredDeliveryT']
    # Reconstruct burn per net tonne, then evaluate cash flows independently.
    burn_factor=(k*t)/(1-k*t) if row['model']=='linear' else math.expm1(k*t)
    burn=q*burn_factor; origin=q+burn; co2=burn*3.16
    ratio=(row['originPriceScenarioUsdPerT']*origin+row['carbonUsdPerTCo2']*co2+row['extraCostUsdPerDeliveredT']*q)/(row['originPriceScenarioUsdPerT']*q)
    near(row['additionalBurnT'],burn); near(row['extraOriginUpliftT'],origin)
    near(row['additionalCo2T'],co2); near(row['breakEvenPriceRatio'],ratio)
    near(row['breakEvenPremiumPct'],100*(ratio-1))
    near(origin-burn,q); near(row['sharedQuotaAdditionalUseT'],burn)
    # Bounded interruption: material conservation and distinct origin normalization.
    used=row['localExtraOriginUsedT']; displaced=row['localDestinationUpliftDisplacedT']
    near(displaced,used/(1+burn_factor))
    near(row['localAdditionalBurnT'],used-displaced)
    near(row['localAdditionalCo2T'],(used-displaced)*3.16)
    checks['local_csv_emissions_and_burn_rows']+=1
    near(displaced+row['localGapRemainingT'],row['localGapRequiredT'])
    yes(used<=row['localExtraOriginHeadroomT']+1e-10)
    yes(displaced<=row['localGapRequiredT']+1e-10)
    checks['artifact_cashflow_and_mass_balance_rows']+=1

# Monotonicity from exports, holding all other factorial dimensions fixed.
dims=['routeId','model','kPerHour','speedKph','pathFactor','carbonUsdPerTCo2']
for dimension in ['kPerHour','speedKph','pathFactor','carbonUsdPerTCo2']:
    groups=defaultdict(list)
    for row in S: groups[tuple(row[d] for d in dims if d!=dimension)].append(row)
    for group in groups.values():
        group.sort(key=lambda r:r[dimension])
        for lower,upper in zip(group,group[1:]):
            change=upper['breakEvenPremiumPct']-lower['breakEvenPremiumPct']
            yes(change<0 if dimension=='speedKph' else change>0)
            checks['monotonic_adjacent_comparisons']+=1
groups=defaultdict(dict)
for row in S: groups[tuple(row[d] for d in dims if d!='model')][row['model']]=row
for pair in groups.values():
    yes(pair['linear']['additionalBurnT']>pair['exponential']['additionalBurnT'])
    yes(pair['linear']['breakEvenPremiumPct']>pair['exponential']['breakEvenPremiumPct'])
    checks['linear_exponential_pairs']+=1
for envelope in J['routeRanges']:
    for model in ['linear','exponential']:
        subset=[r for r in S if r['routeId']==envelope['routeId'] and r['model']==model and r['carbonUsdPerTCo2']==0]
        E=envelope[model]
        near(min(r['breakEvenPremiumPct'] for r in subset),E['premiumPctMin'])
        near(max(r['breakEvenPremiumPct'] for r in subset),E['premiumPctMax'])
        near(min(r['additionalCo2T'] for r in subset),E['additionalCo2TMin'])
        near(max(r['additionalCo2T'] for r in subset),E['additionalCo2TMax'])
        yes(E['caseCount']==len(subset)==27)
        checks['route_model_envelopes']+=1

# Public functions, including behavior outside checked-in scenario grid.
spec=importlib.util.spec_from_file_location('production_model',R/'model.py'); M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
for model in ['linear','exponential']:
    for t,k in [(0,.035),(4,0)]:
        near(M.break_even_ratio(t,k,model=model),1)
        near(M.transfer_for_delivery(1,t,k,model)['additionalBurnT'],0)
        checks['boundary_cases']+=1
    for gap,headroom in [(0,1),(1,0),(.1,2),(1,1),(1,2)]:
        row=M.local_interruption(gap,headroom,4,.035,model)
        near(row['extraOriginUsedT']-row['additionalBurnT'],row['destinationUpliftDisplacedT'])
        near(row['destinationUpliftDisplacedT']+row['gapRemainingT'],gap)
        yes(row['extraOriginUsedT']<=headroom+1e-12)
        checks['boundary_cases']+=1
    for q in [.1,1,10]:
        ratio=M.break_even_ratio(4,.035,origin_price=900,carbon_price=125,extra_cost_per_delivered_t=37,model=model)
        kwargs=dict(origin_price=900,carbon_price=125,extra_cost_per_delivered_t=37,model=model)
        near(M.incremental_benefit(q,4,.035,destination_price=ratio*900,**kwargs),0)
        yes(M.incremental_benefit(q,4,.035,destination_price=ratio*900+1,**kwargs)>0)
        yes(M.incremental_benefit(q,4,.035,destination_price=ratio*900-1,**kwargs)<0)
        checks['cashflow_threshold_sign_cases']+=1
invalid=[lambda:M.retention_fraction(-1,.035),lambda:M.retention_fraction(4,-.1),lambda:M.retention_fraction(4,.25),lambda:M.retention_fraction(4,.3),lambda:M.retention_fraction(float('nan'),.035),lambda:M.retention_fraction(float('inf'),.035),lambda:M.retention_fraction(True,.035),lambda:M.retention_fraction(4,.035,'other'),lambda:M.break_even_ratio(4,.035,origin_price=0),lambda:M.break_even_ratio(4,.035,carbon_price=-1),lambda:M.transfer_for_delivery(-1,4,.035),lambda:M.great_circle_km(91,0,0,0),lambda:M.great_circle_km(0,181,0,0)]
for call in invalid:
    try: call()
    except ValueError: checks['invalid_domain_rejections']+=1
    else: raise AssertionError('Expected invalid input rejection')
near(M.great_circle_km(0,0,0,0),0); near(M.great_circle_km(0,0,0,180),math.pi*6371.0088)
checks['geometric_boundary_cases']=2

lines=['Independent numerical audit — 12 November 2026','PASS: no mathematical discrepancy found in the implemented or exported scenario domain.','',f'Model SHA256: {hashlib.sha256((R/"model.py").read_bytes()).hexdigest()}',f'Input SHA256: {J["meta"]["inputsSha256"]}','', 'Checks actually executed:']
lines += [f'- {k}: {v}' for k,v in checks.items()]
lines += ['', 'Independent great-circle distances (spherical law of cosines, radius 6371.0088 km):']
lines += [f'- {route}: {distance:.9f} km' for route,distance in distances.items()]
lines += ['', 'Headline: 4 h, k=0.035/hour, 1 t net delivered => 1.162790697674 t extra origin uplift, 0.162790697674 t additional burn, 0.514418604651 t combustion CO2, 16.2790697674% zero-carbon premium. With $100/tCO2 and illustrative $1000/t origin fuel: 21.4232558140%.', 'Independent calculation of the distinct 1 t origin-headroom case: 0.86 t delivered, 0.14 t burned, 0.4424 t CO2. Do not mix its denominator with the net-delivered headline.', '', 'Source/unit review: ICAO range is 0.025–0.045 per airborne hour of additional onboard weight, not percent of total baseline trip fuel. Both retention laws are explicitly author assumptions; aircraft calibration and operational feasibility are not established. Fuel and CO2 are metric tonnes, prices USD/t fuel, carbon USD/tCO2. Time is derived from assumed speed/path and is not an observed schedule or flight track.', '', 'Interpretation: conditional approximations and finite sensitivity envelopes, not live airport prices, probabilistic confidence intervals, dispatch recommendations or observed savings. Proprietary quote feeds are unnecessary for a price-ratio threshold analysis. Actual operator-valid airport prices and aircraft/operations data would be needed for actionable airline purchase/dispatch recommendations.', '', 'Audit scope: checked 36 central CSV rows and 486 sensitivity CSV rows, plus consistency of all 36 central JSON rows with CSV; some central scenarios also occur within the sensitivity grid. Numeric tolerance 2e-9 accounts for 12-significant-digit CSV serialization. Independent geometry, financial cash-flow reconstruction, mass conservation, monotonicity and public API boundary cases were used. Production code was not changed.']
text='\n'.join(lines)+'\n'; print(text, end='')
