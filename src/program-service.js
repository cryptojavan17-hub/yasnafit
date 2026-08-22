/**
 * Program Service - Single Source of Truth
 * Normalized tables are primary, JSON is synchronized representation
 */

const crypto = require('crypto');
const { validateProgram } = require('./validation');

function genHash(){
  return Math.random().toString(36).substring(2,10) + Date.now().toString(36);
}

function genUUID(){
  if(crypto.randomUUID) return crypto.randomUUID();
  return genHash() + genHash();
}

function normalizeProgramInput(input){
  // Ensure program has days array with proper structure
  const program = JSON.parse(JSON.stringify(input)); // deep clone

  if(!program.days) program.days = program.program_data?.days || [];

  program.days = (program.days||[]).map((day, idx)=>{
    return {
      day_number: day.day_number ?? day.dayNumber ?? idx+1,
      dayHash: day.dayHash || day.day_hash || genHash(),
      day_hash: day.dayHash || day.day_hash || genHash(),
      focus: day.focus || '',
      coachNote: day.coachNote || day.coach_note || '',
      coach_note: day.coachNote || day.coach_note || '',
      isRestDay: !!(day.isRestDay || day.is_rest_day),
      is_rest_day: !!(day.isRestDay || day.is_rest_day),
      data: (day.data || day.systems || []).map(sys=>{
        return {
          exercise_system_id: sys.exercise_system_id ?? sys.exerciseSystemId ?? 1,
          exerciseSystemHash: sys.exerciseSystemHash || sys.system_hash || sys.systemHash || genHash(),
          system_hash: sys.exerciseSystemHash || sys.system_hash || sys.systemHash || genHash(),
          system_type: sys.system_type || sys.systemType || 'normal',
          movement_list: (sys.movement_list || sys.movements || sys.data || []).map((mov, movIdx)=>{
            return {
              exercise_id: mov.exercise_id ?? mov.exerciseId ?? mov.original_exercise_id ?? null,
              original_exercise_id: mov.original_exercise_id ?? mov.exercise_id ?? mov.exerciseId ?? null,
              exerciseId: mov.exerciseId ?? mov.exercise_id ?? null,
              nameFa: mov.nameFa || mov.name || '',
              movementHash: mov.movementHash || mov.movement_hash || genHash(),
              movement_hash: mov.movementHash || mov.movement_hash || genHash(),
              description: mov.description || '',
              order_index: mov.order_index ?? movIdx,
              sets: (mov.sets||[]).map(s=>{
                return {
                  type: s.type || s.set_type || 'REPEAT',
                  set_type: s.type || s.set_type || 'REPEAT',
                  count: s.count ?? s.count_value ?? 12,
                  count_value: s.count ?? s.count_value ?? 12,
                  weight: s.weight ?? null,
                  restSeconds: s.restSeconds ?? s.rest_seconds ?? 60,
                  rest_seconds: s.restSeconds ?? s.rest_seconds ?? 60,
                  setHash: s.setHash || s.set_hash || genHash(),
                  set_hash: s.setHash || s.set_hash || genHash(),
                };
              })
            };
          })
        };
      })
    };
  });

  return program;
}

function buildProgramFromDB(db, programId){
  // Always build from normalized tables - primary source of truth
  const program = db.prepare('SELECT * FROM training_programs WHERE id=? AND deleted_at IS NULL').get(programId);
  if(!program) return null;

  const days = db.prepare('SELECT * FROM program_days WHERE program_id=? AND deleted_at IS NULL ORDER BY day_number').all(programId);

  const fullDays = days.map(d=>{
    const systems = db.prepare('SELECT * FROM exercise_systems WHERE day_id=? AND deleted_at IS NULL ORDER BY id').all(d.id);
    const fullSystems = systems.map(sys=>{
      const movements = db.prepare(`
        SELECT pm.*, e.name_fa, e.original_id, e.category_id, e.subcategory_id
        FROM program_movements pm
        LEFT JOIN exercises e ON e.id=pm.exercise_id
        WHERE pm.system_id=? AND pm.deleted_at IS NULL
        ORDER BY pm.order_index, pm.id
      `).all(sys.id);

      const fullMovements = movements.map(m=>{
        const sets = db.prepare('SELECT * FROM movement_sets WHERE movement_id=? AND deleted_at IS NULL ORDER BY id').all(m.id);
        return {
          id: m.id,
          exercise_id: m.exercise_id,
          original_exercise_id: m.original_exercise_id,
          exerciseId: m.exercise_id,
          nameFa: m.name_fa || '',
          name: m.name_fa || '',
          movementHash: m.movement_hash,
          movement_hash: m.movement_hash,
          description: m.description||'',
          order_index: m.order_index,
          stable_id: m.stable_id,
          version: m.version,
          sets: sets.map(s=>({
            id: s.id,
            type: s.set_type,
            set_type: s.set_type,
            count: s.count_value,
            count_value: s.count_value,
            weight: s.weight,
            restSeconds: s.rest_seconds,
            rest_seconds: s.rest_seconds,
            setHash: s.set_hash,
            set_hash: s.set_hash,
            stable_id: s.stable_id,
            version: s.version
          }))
        };
      });

      return {
        id: sys.id,
        exercise_system_id: sys.exercise_system_id,
        exerciseSystemHash: sys.system_hash,
        system_hash: sys.system_hash,
        system_type: sys.system_type,
        stable_id: sys.stable_id,
        version: sys.version,
        movement_list: fullMovements,
        data: fullMovements // alias for compatibility
      };
    });

    return {
      id: d.id,
      day_number: d.day_number,
      dayNumber: d.day_number,
      dayHash: d.day_hash,
      day_hash: d.day_hash,
      focus: d.focus||'',
      coachNote: d.coach_note||'',
      coach_note: d.coach_note||'',
      isRestDay: !!d.is_rest_day,
      is_rest_day: !!d.is_rest_day,
      stable_id: d.stable_id,
      version: d.version,
      data: fullSystems
    };
  });

  const programData = {
    version: program.version||2,
    days: fullDays
  };

  return {
    dbProgram: program,
    programData
  };
}

function saveProgramToDB(db, programId, programInput){
  // Validate
  const normalizedInput = normalizeProgramInput(programInput);
  const errors = validateProgram(normalizedInput);
  if(errors.length>0){
    const err = new Error('Validation failed: ' + errors.join('; '));
    err.validationErrors = errors;
    err.statusCode = 400;
    throw err;
  }

  // Transaction: normalized tables are primary source of truth
  db.exec('BEGIN');
  try {
    // Update training_programs base
    const existing = db.prepare('SELECT * FROM training_programs WHERE id=?').get(programId);
    if(!existing) throw new Error('Program not found');

    // Delete old children (hard delete is okay because we recreate transactionally)
    db.prepare('DELETE FROM program_days WHERE program_id=?').run(programId);
    // Cascades delete systems, movements, sets via FK

    // Insert new days
    for(const day of normalizedInput.days){
      const dayHash = day.dayHash || genHash();
      const stableId = genUUID();
      const dayRes = db.prepare(`
        INSERT INTO program_days (program_id, day_number, day_hash, focus, coach_note, is_rest_day, stable_id, version)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(programId, day.day_number, dayHash, day.focus||'', day.coach_note||'', day.isRestDay?1:0, stableId, 1);
      const dayId = dayRes.lastInsertRowid;

      for(const sys of (day.data||[])){
        const sysHash = sys.exerciseSystemHash || genHash();
        const sysStable = genUUID();
        const sysRes = db.prepare(`
          INSERT INTO exercise_systems (day_id, exercise_system_id, system_hash, system_type, stable_id, version)
          VALUES (?,?,?,?,?,?)
        `).run(dayId, sys.exercise_system_id||1, sysHash, sys.system_type||'normal', sysStable, 1);
        const sysId = sysRes.lastInsertRowid;

        let orderIdx=0;
        for(const mov of (sys.movement_list||[])){
          const movHash = mov.movementHash || genHash();
          const movStable = genUUID();

          // Resolve exercise_id: should be internal id, not original_id
          let internalExId = mov.exercise_id || null;
          let originalExId = mov.original_exercise_id || null;

          // If exercise_id looks like original_id (e.g., from old data where exercise_id was original_id), try to resolve
          if(internalExId){
            // Check if internalExId exists as exercises.id
            const exById = db.prepare('SELECT id, original_id FROM exercises WHERE id=?').get(internalExId);
            if(!exById){
              // Try as original_id
              const exByOrig = db.prepare('SELECT id, original_id FROM exercises WHERE original_id=?').get(internalExId);
              if(exByOrig){
                originalExId = exByOrig.original_id;
                internalExId = exByOrig.id;
              } else {
                // Invalid exercise, set null but keep original for debugging
                originalExId = internalExId;
                internalExId = null;
              }
            } else {
              originalExId = exById.original_id;
            }
          }

          if(!internalExId && originalExId){
            const exByOrig = db.prepare('SELECT id FROM exercises WHERE original_id=?').get(originalExId);
            if(exByOrig) internalExId = exByOrig.id;
          }

          const movRes = db.prepare(`
            INSERT INTO program_movements (system_id, exercise_id, original_exercise_id, movement_hash, description, order_index, stable_id, version)
            VALUES (?,?,?,?,?,?,?,?)
          `).run(sysId, internalExId, originalExId, movHash, mov.description||'', orderIdx++, movStable, 1);
          const movId = movRes.lastInsertRowid;

          for(const s of (mov.sets||[])){
            const setHash = s.setHash || genHash();
            const setStable = genUUID();
            db.prepare(`
              INSERT INTO movement_sets (movement_id, set_hash, set_type, count_value, weight, rest_seconds, stable_id, version)
              VALUES (?,?,?,?,?,?,?,?)
            `).run(movId, setHash, s.type||'REPEAT', s.count!=null?String(s.count):null, s.weight||null, s.restSeconds||60, setStable, 1);
          }
        }
      }
    }

    // Now build JSON from DB (source of truth) and sync to program_data
    const built = buildProgramFromDB(db, programId);
    const jsonToStore = JSON.stringify(built ? built.programData : {days: normalizedInput.days, version:2});

    db.prepare(`
      UPDATE training_programs
      SET title=?, coach_note=?, status=?, start_date=?, end_date=?, student_id=?, program_data=?, updated_at=CURRENT_TIMESTAMP, version=version+1
      WHERE id=?
    `).run(
      normalizedInput.title||existing.title,
      normalizedInput.coach_note||existing.coach_note,
      normalizedInput.status||existing.status,
      normalizedInput.start_date||existing.start_date,
      normalizedInput.end_date||existing.end_date,
      normalizedInput.student_id!=null?normalizedInput.student_id:existing.student_id,
      jsonToStore,
      programId
    );

    db.exec('COMMIT');
    return buildProgramFromDB(db, programId);
  } catch(e){
    db.exec('ROLLBACK');
    throw e;
  }
}

function createProgramInDB(db, programInput){
  const normalizedInput = normalizeProgramInput(programInput);
  const errors = validateProgram(normalizedInput);
  if(errors.length>0){
    const err = new Error('Validation failed: ' + errors.join('; '));
    err.validationErrors = errors;
    err.statusCode = 400;
    throw err;
  }

  db.exec('BEGIN');
  try {
    const stableId = genUUID();
    const initialJson = JSON.stringify({days:[]});
    const progRes = db.prepare(`
      INSERT INTO training_programs (student_id, title, coach_note, status, start_date, end_date, program_data, stable_id, version)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      normalizedInput.student_id||null,
      normalizedInput.title||'برنامه تمرینی جدید',
      normalizedInput.coach_note||'',
      normalizedInput.status||'پیش‌نویس',
      normalizedInput.start_date||null,
      normalizedInput.end_date||null,
      initialJson,
      stableId,
      1
    );
    const programId = progRes.lastInsertRowid;

    // Insert days etc.
    for(const day of normalizedInput.days){
      const dayHash = day.dayHash || genHash();
      const dayStable = genUUID();
      const dayRes = db.prepare(`
        INSERT INTO program_days (program_id, day_number, day_hash, focus, coach_note, is_rest_day, stable_id, version)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(programId, day.day_number, dayHash, day.focus||'', day.coach_note||'', day.isRestDay?1:0, dayStable, 1);
      const dayId = dayRes.lastInsertRowid;

      for(const sys of (day.data||[])){
        const sysHash = sys.exerciseSystemHash || genHash();
        const sysStable = genUUID();
        const sysRes = db.prepare(`
          INSERT INTO exercise_systems (day_id, exercise_system_id, system_hash, system_type, stable_id, version)
          VALUES (?,?,?,?,?,?)
        `).run(dayId, sys.exercise_system_id||1, sysHash, sys.system_type||'normal', sysStable, 1);
        const sysId = sysRes.lastInsertRowid;

        let orderIdx=0;
        for(const mov of (sys.movement_list||[])){
          const movHash = mov.movementHash || genHash();
          const movStable = genUUID();
          let internalExId = mov.exercise_id || null;
          let originalExId = mov.original_exercise_id || null;
          if(internalExId){
            const exById = db.prepare('SELECT id, original_id FROM exercises WHERE id=?').get(internalExId);
            if(!exById){
              const exByOrig = db.prepare('SELECT id, original_id FROM exercises WHERE original_id=?').get(internalExId);
              if(exByOrig){
                originalExId = exByOrig.original_id;
                internalExId = exByOrig.id;
              } else {
                originalExId = internalExId;
                internalExId = null;
              }
            } else {
              originalExId = exById.original_id;
            }
          }
          if(!internalExId && originalExId){
            const exByOrig = db.prepare('SELECT id FROM exercises WHERE original_id=?').get(originalExId);
            if(exByOrig) internalExId = exByOrig.id;
          }
          const movRes = db.prepare(`
            INSERT INTO program_movements (system_id, exercise_id, original_exercise_id, movement_hash, description, order_index, stable_id, version)
            VALUES (?,?,?,?,?,?,?,?)
          `).run(sysId, internalExId, originalExId, movHash, mov.description||'', orderIdx++, movStable, 1);
          const movId = movRes.lastInsertRowid;
          for(const s of (mov.sets||[])){
            const setHash = s.setHash || genHash();
            const setStable = genUUID();
            db.prepare(`
              INSERT INTO movement_sets (movement_id, set_hash, set_type, count_value, weight, rest_seconds, stable_id, version)
              VALUES (?,?,?,?,?,?,?,?)
            `).run(movId, setHash, s.type||'REPEAT', s.count!=null?String(s.count):null, s.weight||null, s.restSeconds||60, setStable, 1);
          }
        }
      }
    }

    // Build final JSON from DB and update
    const built = buildProgramFromDB(db, programId);
    const finalJson = JSON.stringify(built.programData);
    db.prepare('UPDATE training_programs SET program_data=? WHERE id=?').run(finalJson, programId);

    db.exec('COMMIT');
    return {id: programId, programData: built.programData};
  } catch(e){
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = {
  genHash,
  genUUID,
  normalizeProgramInput,
  buildProgramFromDB,
  saveProgramToDB,
  createProgramInDB
};
