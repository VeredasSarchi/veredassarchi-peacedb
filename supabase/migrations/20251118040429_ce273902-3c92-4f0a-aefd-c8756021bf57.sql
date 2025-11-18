-- Create pre_clientes table
CREATE TABLE public.pre_clientes (
    id_precliente UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    numero_formulario VARCHAR(20),
    nombre_completo VARCHAR(120) NOT NULL,
    estado_civil VARCHAR(50),
    profesion VARCHAR(80),
    identificacion VARCHAR(30),
    direccion TEXT,
    correo VARCHAR(120),
    telefono1 VARCHAR(20),
    telefono2 VARCHAR(20),
    lote_numero VARCHAR(20),
    producto VARCHAR(100),
    precio DECIMAL(12,2),
    total_meses INT,
    cuota_fija DECIMAL(12,2),
    dia_pago INT,
    prima DECIMAL(12,2),
    saldo DECIMAL(12,2),
    fecha DATE,
    metodo_pago VARCHAR(50),
    vendedor VARCHAR(120),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pre_autorizados table
CREATE TABLE public.pre_autorizados (
    id_autorizado UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_precliente UUID REFERENCES public.pre_clientes(id_precliente) ON DELETE CASCADE,
    nombre VARCHAR(120),
    cedula VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pre_beneficiarios table
CREATE TABLE public.pre_beneficiarios (
    id_beneficiario UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_precliente UUID REFERENCES public.pre_clientes(id_precliente) ON DELETE CASCADE,
    nombre VARCHAR(120),
    cedula VARCHAR(30),
    contacto VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clientes table
CREATE TABLE public.clientes (
    id_cliente UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    numero_formulario VARCHAR(20),
    nombre_completo VARCHAR(120) NOT NULL,
    estado_civil VARCHAR(50),
    profesion VARCHAR(80),
    cedula VARCHAR(30),
    direccion TEXT,
    correo VARCHAR(120),
    telefono1 VARCHAR(20),
    telefono2 VARCHAR(20),
    jardin VARCHAR(20),
    lote_numero VARCHAR(20),
    tipo_lote VARCHAR(20),
    tipo_cenizario VARCHAR(20),
    tipo_cremacion VARCHAR(20),
    tipo_paquetefunerario VARCHAR(20),
    arrendamiento DECIMAL(12,2),
    plazo_arrendamiento DECIMAL(12,2),
    cuota_mes DECIMAL(12,2),
    producto VARCHAR(100),
    precio DECIMAL(12,2),
    total_meses INT,
    cuota_fija DECIMAL(12,2),
    dia_pago INT,
    prima DECIMAL(12,2),
    saldo DECIMAL(12,2),
    fecha DATE,
    metodo_pago VARCHAR(50),
    vendedor VARCHAR(120),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cli_autorizados table
CREATE TABLE public.cli_autorizados (
    id_autorizado UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_cliente UUID REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    nombre VARCHAR(120),
    cedula VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cli_beneficiarios table
CREATE TABLE public.cli_beneficiarios (
    id_beneficiario UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    id_cliente UUID REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    nombre VARCHAR(120),
    cedula VARCHAR(30),
    contacto VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.pre_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_autorizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_beneficiarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cli_autorizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cli_beneficiarios ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for pre_clientes (allowing authenticated users full access)
CREATE POLICY "Authenticated users can view pre_clientes"
ON public.pre_clientes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert pre_clientes"
ON public.pre_clientes FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update pre_clientes"
ON public.pre_clientes FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete pre_clientes"
ON public.pre_clientes FOR DELETE
TO authenticated
USING (true);

-- Create RLS policies for pre_autorizados
CREATE POLICY "Authenticated users can view pre_autorizados"
ON public.pre_autorizados FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert pre_autorizados"
ON public.pre_autorizados FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update pre_autorizados"
ON public.pre_autorizados FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete pre_autorizados"
ON public.pre_autorizados FOR DELETE
TO authenticated
USING (true);

-- Create RLS policies for pre_beneficiarios
CREATE POLICY "Authenticated users can view pre_beneficiarios"
ON public.pre_beneficiarios FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert pre_beneficiarios"
ON public.pre_beneficiarios FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update pre_beneficiarios"
ON public.pre_beneficiarios FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete pre_beneficiarios"
ON public.pre_beneficiarios FOR DELETE
TO authenticated
USING (true);

-- Create RLS policies for clientes
CREATE POLICY "Authenticated users can view clientes"
ON public.clientes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert clientes"
ON public.clientes FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update clientes"
ON public.clientes FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete clientes"
ON public.clientes FOR DELETE
TO authenticated
USING (true);

-- Create RLS policies for cli_autorizados
CREATE POLICY "Authenticated users can view cli_autorizados"
ON public.cli_autorizados FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert cli_autorizados"
ON public.cli_autorizados FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update cli_autorizados"
ON public.cli_autorizados FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete cli_autorizados"
ON public.cli_autorizados FOR DELETE
TO authenticated
USING (true);

-- Create RLS policies for cli_beneficiarios
CREATE POLICY "Authenticated users can view cli_beneficiarios"
ON public.cli_beneficiarios FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert cli_beneficiarios"
ON public.cli_beneficiarios FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update cli_beneficiarios"
ON public.cli_beneficiarios FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete cli_beneficiarios"
ON public.cli_beneficiarios FOR DELETE
TO authenticated
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_pre_clientes_updated_at
BEFORE UPDATE ON public.pre_clientes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at
BEFORE UPDATE ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_pre_clientes_numero_formulario ON public.pre_clientes(numero_formulario);
CREATE INDEX idx_pre_clientes_identificacion ON public.pre_clientes(identificacion);
CREATE INDEX idx_pre_autorizados_id_precliente ON public.pre_autorizados(id_precliente);
CREATE INDEX idx_pre_beneficiarios_id_precliente ON public.pre_beneficiarios(id_precliente);

CREATE INDEX idx_clientes_numero_formulario ON public.clientes(numero_formulario);
CREATE INDEX idx_clientes_cedula ON public.clientes(cedula);
CREATE INDEX idx_cli_autorizados_id_cliente ON public.cli_autorizados(id_cliente);
CREATE INDEX idx_cli_beneficiarios_id_cliente ON public.cli_beneficiarios(id_cliente);