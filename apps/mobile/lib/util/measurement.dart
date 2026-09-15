/// Field error used by Fastify: observedValue − testLoad.
double calculatedError(double observedValue, double testLoad) => observedValue - testLoad;

/// Prototype comparison against configurable type tolerance (not a legal MPE table).
bool withinPrototypeTolerance(double error, double permissibleError) =>
    error.abs() <= permissibleError;
